import type { ContinueArtwork, ContinueFeedItem } from "../../contracts/continueWatching";

import type { Candidate } from "./backdropMetadata";
import { asRecord, titleKey } from "./backdropMetadata";
import type { CacheStorage } from "./createBackdropCache";
import { createBackdropCache } from "./createBackdropCache";
import { createCinemetaMissCache } from "./createCinemetaMissCache";
import { findCinemetaMatch } from "./findCinemetaMatch";

const CINEMETA_API = "https://v3-cinemeta.strem.io";
const BACKDROP_CACHE_KEY = "aerotizen.continueWatching.cinemetaBackdrops.v1";
const POSTER_CACHE_KEY = "aerotizen.continueWatching.cinemetaPosters.v1";
const METAHUB_BACKDROP =
  /^https:\/\/(?:images|live)\.metahub\.space\/background\/(?:small|medium|large)\/tt[0-9]+\/img$/;
const METAHUB_POSTER = /^https:\/\/(?:images|live)\.metahub\.space\/poster\/(?:small|medium|large)\/tt[0-9]+\/img$/;
const METAHUB_POSTER_BASE = "https://images.metahub.space/poster/small/";
const MAX_ACTIVE_LOOKUPS = 3;
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

type ArtworkListener = (match?: Candidate) => void;

interface ArtworkJob {
  cancel(): void;
  readonly listeners: Set<ArtworkListener>;
}

interface Dependencies {
  createRequest(): XMLHttpRequest;
  excludedSourceIds: ReadonlySet<string>;
  now?: () => number;
  storage?: CacheStorage;
  storageKey?: string;
  timers: Pick<Window, "clearTimeout" | "setTimeout">;
}

export const createCinemetaArtworkLookup = ({
  createRequest,
  excludedSourceIds,
  now = Date.now,
  storage,
  storageKey = BACKDROP_CACHE_KEY,
  timers,
}: Dependencies) => {
  const backdrops = createBackdropCache(
    storageKey,
    (url) => (METAHUB_BACKDROP.test(url) ? url : undefined),
    now,
    storage,
  );
  const posters = createBackdropCache(
    POSTER_CACHE_KEY,
    (url) => (METAHUB_POSTER.test(url) ? url : undefined),
    now,
    storage,
  );
  const misses = createCinemetaMissCache(storageKey, now, storage);
  const jobs = new Map<string, ArtworkJob>();
  const queue = new Set<() => void>();
  let running = 0;
  const advance = () => {
    while (running < MAX_ACTIVE_LOOKUPS) {
      const next = queue.values().next().value;
      if (!next) {
        return;
      }
      queue.delete(next);
      running++;
      next();
    }
  };

  const read = (path: string, requests: Set<() => void>) =>
    new Promise<Candidate | undefined>((resolve) => {
      const xhr = createRequest();
      const finish = (value?: Candidate) => {
        requests.delete(abort);
        resolve(value);
      };
      const abort = () => {
        finish();
        try {
          xhr.abort();
        } catch {
          // Some TV transports do not signal cancellation.
        }
      };
      requests.add(abort);
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

  const createJob = (item: ContinueFeedItem, matchKey: string): ArtworkJob => {
    const listeners = new Set<ArtworkListener>();
    const requests = new Set<() => void>();
    const load = async () => {
      let match: Candidate | null | undefined;
      try {
        const title = item.imdbId ? undefined : encodeURIComponent(item.title.trim());
        const paths = getCatalogueType(item.mediaKind).map((type) =>
          item.imdbId ? `/meta/${type}/${item.imdbId}.json` : `/catalog/${type}/top/search=${title}.json`,
        );
        match = findCinemetaMatch(item, await Promise.all(paths.map((path) => read(path, requests))));
      } catch {
        // Fall back to source artwork if the catalogue cannot be read.
      }
      running--;
      if (jobs.get(matchKey) === job) {
        jobs.delete(matchKey);
        if (match === null) {
          misses.remember(matchKey);
        }
        listeners.forEach((listener) => listener(match ?? undefined));
      }
      advance();
    };
    const run = () => void load();
    const timer = timers.setTimeout(() => {
      queue.add(run);
      advance();
    }, FOCUS_DELAY_MS);
    const job: ArtworkJob = {
      listeners,
      cancel() {
        timers.clearTimeout(timer);
        queue.delete(run);
        requests.forEach((abort) => abort());
      },
    };
    jobs.set(matchKey, job);
    return job;
  };

  const watchArtwork = (
    kind: "background" | "poster",
    item: ContinueFeedItem,
    show: (result: ContinueArtwork) => void,
  ) => {
    if (excludedSourceIds.has(item.sourceId)) {
      show({ status: "ready" });
      return () => {};
    }
    const cache = kind === "background" ? backdrops : posters;
    const cached = cache.get(item.key);
    if (cached) {
      show({ status: "ready", url: cached });
      return () => {};
    }
    if (kind === "poster" && item.imdbId) {
      show({ status: "ready", url: METAHUB_POSTER_BASE + item.imdbId + "/img" });
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
    const reused = cache.reuse(item.key, matchKey);
    if (reused) {
      show({ status: "ready", url: reused });
      return () => {};
    }
    if (misses.has(matchKey)) {
      show({ status: "ready" });
      return () => {};
    }
    show({ status: "pending" });
    const job = jobs.get(matchKey) ?? createJob(item, matchKey);
    const listener = (match?: Candidate) => {
      const background = backdrops.get(item.key) ?? backdrops.remember(item.key, match?.background, matchKey);
      const poster = posters.get(item.key) ?? posters.remember(item.key, match?.poster, matchKey);
      show({ status: "ready", url: kind === "background" ? background : poster });
    };
    job.listeners.add(listener);
    return () => {
      job.listeners.delete(listener);
      if (job.listeners.size === 0 && jobs.get(matchKey) === job) {
        jobs.delete(matchKey);
        job.cancel();
      }
    };
  };

  let stopBackdrop = () => {};
  return {
    cancel() {
      stopBackdrop();
      const active = [...jobs.values()];
      jobs.clear();
      active.forEach((job) => job.cancel());
    },
    watch(item: ContinueFeedItem, show: (result: ContinueArtwork) => void) {
      stopBackdrop();
      stopBackdrop = watchArtwork("background", item, show);
      return stopBackdrop;
    },
    watchPoster: (item: ContinueFeedItem, show: (result: ContinueArtwork) => void) =>
      watchArtwork("poster", item, show),
  };
};
