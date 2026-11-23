import type {
  ContinueArtwork,
  ContinueFeedItem,
  ContinueWatchingService,
  ContinueWatchingSnapshot,
} from "../contracts/continueWatching";
import type { ContinueItem } from "../contracts/launcher";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createCinemetaArtworkLookup } from "../services/continueWatching/createCinemetaArtworkLookup";
import { createStore } from "../shared/state/createStore";

import { previewAppId } from "./previewApps";

const CARD_ART_BASE_URL = "https://images.metahub.space/background/small/";

interface PreviewProgramme {
  readonly artworkId: string;
  readonly durationSeconds: number;
  readonly episode?: number;
  readonly playbackSeconds: number;
  readonly releaseYear: number;
  readonly season?: number;
  readonly sourceName: Parameters<typeof previewAppId>[0];
  readonly title: string;
}

// The titles and episodes are real. Viewing history belongs only to the demo.
/* eslint-disable launcher-i18n/translated-copy -- Programme titles are sample content metadata, like source-provided titles. */
const programmes: readonly PreviewProgramme[] = [
  {
    title: "Stranger Things",
    sourceName: "Netflix",
    artworkId: "tt4574334",
    releaseYear: 2016,
    season: 1,
    episode: 3,
    durationSeconds: 3120,
    playbackSeconds: 1934,
  },
  {
    title: "Road House",
    sourceName: "Prime Video",
    artworkId: "tt3359350",
    releaseYear: 2024,
    durationSeconds: 7260,
    playbackSeconds: 0,
  },
  {
    title: "The Expanse",
    sourceName: "Stremio",
    artworkId: "tt3230854",
    releaseYear: 2015,
    season: 2,
    episode: 1,
    durationSeconds: 2640,
    playbackSeconds: 2191,
  },
  {
    title: "The Lord of the Rings: The Rings of Power",
    sourceName: "Prime Video",
    artworkId: "tt7631058",
    releaseYear: 2022,
    season: 1,
    episode: 2,
    durationSeconds: 4020,
    playbackSeconds: 1729,
  },
  {
    title: "Killers of the Flower Moon",
    sourceName: "Apple TV",
    artworkId: "tt5537002",
    releaseYear: 2023,
    durationSeconds: 12360,
    playbackSeconds: 1978,
  },
  {
    title: "Andor",
    sourceName: "Disney+",
    artworkId: "tt9253284",
    releaseYear: 2022,
    season: 1,
    episode: 2,
    durationSeconds: 2280,
    playbackSeconds: 798,
  },
  {
    title: "Severance",
    sourceName: "Apple TV",
    artworkId: "tt11280740",
    releaseYear: 2022,
    season: 1,
    episode: 4,
    durationSeconds: 2760,
    playbackSeconds: 1987,
  },
] as const;
/* eslint-enable launcher-i18n/translated-copy */

export const previewContinueSources = Object.freeze(
  [...new Set(programmes.map((programme) => programme.sourceName))]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => Object.freeze({ id: previewAppId(name), name, storeId: previewAppId(name), status: "" })),
);

const items: readonly ContinueFeedItem[] = Object.freeze(
  programmes.map(
    ({ title, sourceName, artworkId, releaseYear, season = 0, episode = 0, durationSeconds, playbackSeconds }) =>
      Object.freeze({
        key: "demo-" + artworkId,
        title,
        sourceId: previewAppId(sourceName),
        sourceName,
        season,
        episode,
        releaseYear,
        mediaKind: episode ? "tv" : "movie",
        // Like Samsung feeds, the other sample sources match by title and year.
        imdbId: sourceName === "Stremio" ? artworkId : undefined,
        duration: durationSeconds,
        playback: playbackSeconds,
        backgroundImage: CARD_ART_BASE_URL + artworkId + "/img",
        payload: "",
        timestamp: 0,
      }),
  ),
);

export const createPreviewContinueWatching = (
  runtime: Pick<LauncherRuntime, "settings" | "toast" | "translate">,
): ContinueWatchingService => {
  const artwork = createCinemetaArtworkLookup({
    createRequest: () => new XMLHttpRequest(),
    excludedSourceIds: new Set(),
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    timers: window,
  });
  const store = createStore<ContinueWatchingSnapshot>(
    Object.freeze({ items: Object.freeze([]), messageKey: "", sources: previewContinueSources }),
  );
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  const refresh = () => {
    if (disposed) {
      return;
    }
    const settings = runtime.settings.getSnapshot();
    store.set(
      Object.freeze({
        items: Object.freeze(
          items.filter((item) => settings.continueWatching && settings.continueWatchingApps.includes(item.sourceId)),
        ),
        messageKey: "",
        sources: previewContinueSources,
      }),
    );
  };
  const watchArtwork =
    (watch: typeof artwork.watch) => (item: ContinueItem, show: (result: ContinueArtwork) => void) => {
      const active = store.getSnapshot().items.find((entry) => entry === item);
      if (!disposed && active) {
        return watch(active, show);
      }
      show({ status: "ready" });
      return () => {};
    };
  return {
    ...store,
    open: (item) => runtime.toast(runtime.translate("apps.wouldOpen", { name: item.title })),
    dispose() {
      disposed = true;
      unsubscribe?.();
      artwork.cancel();
    },
    refresh,
    start() {
      if (!disposed && !unsubscribe) {
        unsubscribe = runtime.settings.subscribe(refresh);
        refresh();
      }
    },
    watchBackdrop: watchArtwork(artwork.watch),
    watchPoster: watchArtwork(artwork.watchPoster),
  };
};
