import type { ContinueBackdrop, ContinueFeedItem } from "../../contracts/continueWatching";

import type { Candidate } from "./backdropMetadata";
import { asRecord, titleKey } from "./backdropMetadata";
import type { CacheStorage } from "./createBackdropCache";
import { createBackdropCache } from "./createBackdropCache";
import { createCinemetaMissCache } from "./createCinemetaMissCache";
import { findCinemetaMatch } from "./findCinemetaMatch";

const CINEMETA_API = "https://v3-cinemeta.strem.io";
const CACHE_KEY = "aerotizen.continueWatching.cinemetaBackdrops.v1";
const METAHUB_BACKDROP =
  /^https:\/\/(?:images|live)\.metahub\.space\/background\/(?:small|medium|large)\/tt[0-9]+\/img$/;
const FOCUS_DELAY_MS = 250;
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_CHARACTERS = 512_000;

const getCatalogueType = (kind: ContinueFeedItem["mediaKind"]) => {
  switch (kind) {
    case "tv":
      return ["series"];
    case "movie":
      return ["movie"];
    default:
      return ["movie", "series"];
  }
};

interface Dependencies {
  createRequest(): XMLHttpRequest;
  excludedSourceIds: ReadonlySet<string>;
  now?: () => number;
  storage?: CacheStorage;
  storageKey?: string;
  timers: Pick<Window, "clearTimeout" | "setTimeout">;
}

export const createCinemetaBackdropLookup = ({
  createRequest,
  excludedSourceIds,
  now = Date.now,
  storage,
  storageKey = CACHE_KEY,
  timers,
}: Dependencies) => {
  const cache = createBackdropCache(storageKey, (url) => (METAHUB_BACKDROP.test(url) ? url : undefined), now, storage);
  const misses = createCinemetaMissCache(storageKey, now, storage);
  let cancelActive = () => {};
  return {
    cancel: () => cancelActive(),
    watch(item: ContinueFeedItem, show: (result: ContinueBackdrop) => void) {
      cancelActive();
      if (excludedSourceIds.has(item.sourceId)) {
        show({ status: "ready" });
        return () => {};
      }
      const cached = cache.get(item.key);
      if (cached) {
        show({ status: "ready", url: cached });
        return () => {};
      }

      const searchTitle = item.imdbId ? undefined : titleKey(item.title);
      if (!item.imdbId && !searchTitle) {
        show({ status: "ready" });
        return () => {};
      }
      const matchKey = JSON.stringify([
        item.sourceId,
        item.mediaKind,
        item.imdbId,
        searchTitle,
        item.imdbId ? undefined : item.releaseYear,
      ]);
      const matchingArtwork = cache.reuse(item.key, matchKey);
      if (matchingArtwork) {
        show({ status: "ready", url: matchingArtwork });
        return () => {};
      }

      if (misses.has(matchKey)) {
        show({ status: "ready" });
        return () => {};
      }

      show({ status: "pending" });
      let active = true;
      const requests = new Set<XMLHttpRequest>();
      const read = (path: string) =>
        new Promise<Candidate | undefined>((resolve) => {
          const xhr = createRequest();
          requests.add(xhr);
          const finish = (value?: Candidate) => {
            requests.delete(xhr);
            resolve(value);
          };
          xhr.onload = () => {
            if (xhr.status !== 200 || xhr.responseText.length > MAX_RESPONSE_CHARACTERS) {
              finish();
              return;
            }
            try {
              finish(asRecord(JSON.parse(xhr.responseText) as unknown));
            } catch {
              finish();
            }
          };
          xhr.onerror = xhr.ontimeout = xhr.onabort = () => finish();
          try {
            xhr.open("GET", CINEMETA_API + path, true);
            xhr.timeout = REQUEST_TIMEOUT_MS;
            xhr.send();
          } catch {
            finish();
          }
        });

      const load = async () => {
        let match: Candidate | null | undefined;
        try {
          const title = item.imdbId ? undefined : encodeURIComponent(item.title.trim());
          const paths = getCatalogueType(item.mediaKind).map((type) =>
            item.imdbId ? `/meta/${type}/${item.imdbId}.json` : `/catalog/${type}/top/search=${title}.json`,
          );
          match = findCinemetaMatch(item, await Promise.all(paths.map(read)));
        } catch {
          // Display source art if the catalogue cannot be read.
        }
        if (active) {
          active = false;
          if (match === null) {
            misses.remember(matchKey);
          }
          show({ status: "ready", url: cache.remember(item.key, match?.background, matchKey) });
        }
      };
      const timer = timers.setTimeout(() => void load(), FOCUS_DELAY_MS);
      const cancel = () => {
        active = false;
        timers.clearTimeout(timer);
        requests.forEach((request) => request.abort());
      };
      cancelActive = cancel;
      return cancel;
    },
  };
};
