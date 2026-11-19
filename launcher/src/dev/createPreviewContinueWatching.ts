import type {
  ContinueFeedItem,
  ContinueWatchingService,
  ContinueWatchingSnapshot,
} from "../contracts/continueWatching";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { normalizeContinueItems } from "../services/continueWatching/normalizeItems";
import { createStore } from "../shared/state/createStore";

import { previewAppId } from "./previewApps";

const PREVIEW_DURATION_SECONDS = 100;
const PREVIEW_ITEM_INTERVAL_MS = 60_000;
const STREMIO_PREVIEW_CONTENT_ID = "tt0000000";
const artworkDirectory = new URL(import.meta.env.DEV ? "src/dev/artwork/" : "artwork/", window.location.href);
const artwork = (filename: string) => new URL(filename, artworkDirectory).href;

// Model native feed records and the Stremio record after its artwork enrichment.
const programmes = [
  {
    sourceName: "Stremio",
    content_id: STREMIO_PREVIEW_CONTENT_ID,
    content_title: "After the Tide",
    season: 1,
    episode: 3,
    playback: 62,
    image_url: "",
    thumbnail_url: artwork("after-the-tide.webp"),
    background_url: artwork("after-the-tide-backdrop.webp"),
    payload: JSON.stringify({
      provider: "stremio",
      type: "series",
      id: STREMIO_PREVIEW_CONTENT_ID,
      videoId: STREMIO_PREVIEW_CONTENT_ID + ":1:3",
      kind: "resume",
    }),
  },
  {
    sourceName: "Netflix",
    content_id: "paper-moons",
    content_title: "Paper Moons",
    season: 0,
    episode: 0,
    playback: 0,
    image_url: artwork("paper-moons.webp"),
  },
  {
    sourceName: "YouTube",
    content_id: "lantern-trail",
    content_title: "The Lantern Trail",
    season: 2,
    episode: 1,
    playback: 83,
    image_url: artwork("lantern-trail.webp"),
  },
  {
    sourceName: "Apple TV",
    content_id: "signal-north",
    content_title: "Signal North and the Last Broadcast from the Edge of the World",
    season: 0,
    episode: 0,
    playback: 43,
    image_url: artwork("signal-north.webp"),
  },
  {
    sourceName: "Prime Video",
    content_id: "quiet-orbit",
    content_title: "A Quiet Orbit",
    season: 0,
    episode: 0,
    playback: 16,
    image_url: artwork("quiet-orbit.webp"),
  },
  {
    sourceName: "Disney+",
    content_id: "coral-archive",
    content_title: "The Coral Archive",
    season: 1,
    episode: 2,
    playback: 35,
    image_url: artwork("coral-archive.webp"),
  },
  {
    sourceName: "Apple TV",
    content_id: "midnight-dispatch",
    content_title: "Midnight Dispatch",
    season: 1,
    episode: 4,
    playback: 72,
    image_url: new URL("assets/weather/night.jpg", window.location.href).href,
  },
] as const;

const previewSource = (name: (typeof programmes)[number]["sourceName"]) => {
  const id = previewAppId(name);
  return Object.freeze({ id, name, storeId: id, status: "", supportsSeparateBackdrop: name === "Stremio" });
};

export const previewContinueSources = Object.freeze(
  [...new Set(programmes.map((programme) => programme.sourceName))]
    .sort((left, right) => left.localeCompare(right))
    .map(previewSource),
);

export const createPreviewContinueWatching = (
  runtime: Pick<LauncherRuntime, "settings" | "toast" | "translate">,
): ContinueWatchingService => {
  const now = Date.now();
  const items = programmes.reduce<ContinueFeedItem[]>((items, { sourceName, ...record }, index) => {
    const source = previewSource(sourceName);
    const feedRecord = {
      app_id: source.storeId,
      duration: PREVIEW_DURATION_SECONDS,
      timestamp: now - index * PREVIEW_ITEM_INTERVAL_MS,
      payload: "watch?id=" + record.content_id,
      ...record,
    };
    return items.concat(normalizeContinueItems(source, [feedRecord], now).map((item) => Object.freeze(item)));
  }, []);
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
  return {
    ...store,
    open: (item) => runtime.toast(runtime.translate("apps.wouldOpen", { name: item.title })),
    dispose() {
      disposed = true;
      unsubscribe?.();
    },
    refresh,
    start() {
      if (!disposed && !unsubscribe) {
        unsubscribe = runtime.settings.subscribe(refresh);
        refresh();
      }
    },
  };
};
