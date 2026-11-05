import type { ContinueItem } from "./contracts/launcher";
import type { LauncherRuntime } from "./platform/tizen/launcherRuntime";

// Fictional programme metadata for the browser preview.
const programmes = [
  ["After the Tide", "Netflix", 1, 1, 3, 62, "#142854", "#6e9ba8"],
  ["Paper Moons", "Prime Video", 3, 0, 0, 0, "#241a48", "#d5837c"],
  ["The Lantern Trail", "YouTube", 0, 2, 1, 83, "#0e3531", "#bbaf63"],
  ["Signal North and the Last Broadcast from the Edge of the World", "Apple TV", 8, 0, 0, 43, "#20345b", "#7baad9"],
  ["A Quiet Orbit", "Prime Video", 3, 0, 0, 16, "#34233d", "#b998ba"],
] as const;

const artwork = (dark: string, light: string, index: number) =>
  "data:image/svg+xml," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="sky" x2="0" y2="1">
        <stop stop-color="${dark}"/><stop offset="1" stop-color="${light}"/>
      </linearGradient></defs>
      <path fill="url(#sky)" d="M0 0h640v360H0z"/>
      <circle cx="${143 + 87 * index}" cy="${128 - 13 * index}" r="${43 + 6 * index}" fill="#fff5d8" opacity=".78"/>
      <path fill="${dark}" opacity=".6" d="M0 240 112 157 237 247 390 152 540 234 640 170V360H0Z"/>
      <path fill="${dark}" d="M0 284 130 227 280 300 432 221 640 279V360H0Z"/>
    </svg>
  `);

if (new URLSearchParams(location.search).get("demo") === "1" && !("tizen" in window)) {
  const runtime = window.AeroTizen;
  const config = runtime.config as LauncherRuntime["config"] & { STORAGE_KEY: string; LEGACY_STORAGE_KEYS: string[] };
  config.STORAGE_KEY += ".demo";
  config.LEGACY_STORAGE_KEYS = [];
  config.DEFAULTS.continueWatching = true;
  config.DEFAULTS.glassSettings = true;
  config.DEFAULTS.cardSize = "small";
  config.DEFAULTS.homeCardMode = "rectangle";
  config.DEFAULTS.home = ["demo0", "demo1", "demo3", "demo6"];

  const items: ContinueItem[] = programmes.map(
    ([name, sourceName, app, season, episode, playback, dark, light], index) => ({
      key: "demo-" + index,
      title: name,
      sourceId: "demo" + app,
      sourceName,
      season,
      episode,
      duration: 100,
      playback,
      image: artwork(dark, light, index),
    }),
  );
  runtime.continueWatching = {
    items,
    messageKey: "continue.demoFeed",
    sources: [],
    open: () => runtime.toast(runtime.translate("continue.demoPlayback")),
    start: () => undefined,
    subscribe: () => () => undefined,
  };
}
