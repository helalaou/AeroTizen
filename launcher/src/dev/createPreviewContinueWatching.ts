import type { ContinueWatchingService } from "../contracts/continueWatching";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";

import { previewAppId } from "./previewApps";

const PREVIEW_DURATION_SECONDS = 100;
const ARTWORK_MOON_POSITIONS = 5;
// Fictional metadata and generated artwork belong only to the browser preview.
/* eslint-disable launcher-i18n/translated-copy -- Programme titles are sample content metadata, like source-provided titles. */
const programmes = [
  {
    title: "After the Tide",
    sourceName: "Netflix",
    season: 1,
    episode: 3,
    playback: 62,
    dark: "#142854",
    light: "#6e9ba8",
  },
  {
    title: "Paper Moons",
    sourceName: "Prime Video",
    season: 0,
    episode: 0,
    playback: 0,
    dark: "#241a48",
    light: "#d5837c",
  },
  {
    title: "The Lantern Trail",
    sourceName: "YouTube",
    season: 2,
    episode: 1,
    playback: 83,
    dark: "#0e3531",
    light: "#bbaf63",
  },
  {
    title: "Signal North and the Last Broadcast from the Edge of the World",
    sourceName: "Apple TV",
    season: 0,
    episode: 0,
    playback: 43,
    dark: "#20345b",
    light: "#7baad9",
  },
  {
    title: "A Quiet Orbit",
    sourceName: "Prime Video",
    season: 0,
    episode: 0,
    playback: 16,
    dark: "#34233d",
    light: "#b998ba",
  },
  {
    title: "The Coral Archive",
    sourceName: "Disney+",
    season: 1,
    episode: 2,
    playback: 35,
    dark: "#17404d",
    light: "#e09979",
  },
  {
    title: "Midnight Dispatch",
    sourceName: "Apple TV",
    season: 1,
    episode: 4,
    playback: 72,
    dark: "#292045",
    light: "#a287cb",
  },
] as const;
/* eslint-enable launcher-i18n/translated-copy */

const artwork = (dark: string, light: string, index: number) => {
  const position = index % ARTWORK_MOON_POSITIONS;
  return (
    "data:image/svg+xml," +
    encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="sky" x2="0" y2="1">
        <stop stop-color="${dark}"/><stop offset="1" stop-color="${light}"/>
      </linearGradient></defs>
      <path fill="url(#sky)" d="M0 0h640v360H0z"/>
      <circle cx="${143 + 87 * position}" cy="${128 - 13 * position}" r="${43 + 6 * position}" fill="#fff5d8" opacity=".78"/>
      <path fill="${dark}" opacity=".6" d="M0 240 112 157 237 247 390 152 540 234 640 170V360H0Z"/>
      <path fill="${dark}" d="M0 284 130 227 280 300 432 221 640 279V360H0Z"/>
    </svg>
  `)
  );
};

export const createPreviewContinueWatching = (
  runtime: Pick<LauncherRuntime, "toast" | "translate">,
): ContinueWatchingService => {
  const items = Object.freeze(
    programmes.map(({ title, sourceName, season, episode, playback, dark, light }, index) =>
      Object.freeze({
        key: "demo-" + index,
        title,
        sourceId: previewAppId(sourceName),
        sourceName,
        season,
        episode,
        duration: PREVIEW_DURATION_SECONDS,
        playback,
        image: artwork(dark, light, index),
        payload: "",
        timestamp: 0,
      }),
    ),
  );
  const snapshot = Object.freeze({ items, messageKey: "" as const, sources: Object.freeze([]) });
  return {
    getSnapshot: () => snapshot,
    open: (item) => runtime.toast(runtime.translate("apps.wouldOpen", { name: item.title })),
    dispose: () => undefined,
    refresh: () => undefined,
    start: () => undefined,
    subscribe: () => () => undefined,
  };
};
