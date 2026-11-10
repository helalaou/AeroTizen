import version from "../version.txt?raw";

import { createLauncherApp } from "./app/createLauncherApp";
import { mountToast } from "./app/mountToast";
import type { BackgroundState } from "./backgrounds/createBackgrounds";
import { mountBackgrounds } from "./backgrounds/mountBackgrounds";
import type { AppsService } from "./contracts/apps";
import type { ContinueWatchingService } from "./contracts/continueWatching";
import type { ClockService } from "./contracts/launcher";
import type { SettingsService } from "./contracts/preferences";
import type { NetworkService, WeatherService } from "./contracts/status";
import { mountFireplace } from "./fireplace/mountFireplace";
import { mountHome } from "./home/index";
import { createAppsPlatform } from "./platform/tizen/createAppsPlatform";
import { createClockPlatform } from "./platform/tizen/createClockPlatform";
import { createContinueWatchingPlatform } from "./platform/tizen/createContinueWatchingPlatform";
import { createNetworkPlatform } from "./platform/tizen/createNetworkPlatform";
import { createWeatherPlatform } from "./platform/tizen/createWeatherPlatform";
import { defaultTemperatureUnit } from "./platform/tizen/defaultTemperatureUnit";
import { createAppsService } from "./services/createAppsService";
import { createClockService } from "./services/createClockService";
import { createContinueWatchingService } from "./services/createContinueWatchingService";
import { createLauncherUpdates } from "./services/createLauncherUpdates";
import { createNetworkService } from "./services/createNetworkService";
import { createSettingsService } from "./services/createSettingsService";
import { createWeatherService } from "./services/createWeatherService";
import { mountSettings } from "./settings/index";

const backgroundHost = document.getElementById("bg");
const home = document.getElementById("home-root");
const settingsHost = document.getElementById("settings-root");
const toastHost = document.getElementById("toast-root");
const weatherPhotoHost = document.getElementById("weather-photo-root");
const fireplaceHost = document.getElementById("fireplace-root");
if (!backgroundHost || !home || !settingsHost || !toastHost || !weatherPhotoHost || !fireplaceHost) {
  throw new Error("Launcher mount points are missing.");
}
const runtime = window.AeroTizen;
const hotData = import.meta.hot
  ? (import.meta.hot.data as {
      backgrounds?: BackgroundState;
      apps?: AppsService;
      clock?: ClockService;
      continueWatching?: ContinueWatchingService;
      network?: NetworkService;
      preferences?: SettingsService;
      weather?: WeatherService;
    })
  : undefined;
const clock =
  hotData?.clock ||
  createClockService({
    platform: createClockPlatform(window, () => runtime.settings?.getSnapshot().numerals ?? "latn"),
    now: () => Date.now(),
    timers: window,
  });
runtime.clock = clock;
const settings =
  hotData?.preferences ||
  createSettingsService({
    defaults: runtime.config.DEFAULTS,
    storageKey: runtime.config.STORAGE_KEY,
    legacyStorageKeys: runtime.config.LEGACY_STORAGE_KEYS,
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    speedRange: runtime.config.SPEED,
    locale: {
      timeFormat: clock.defaultTimeFormat,
      tempUnit: () =>
        defaultTemperatureUnit(navigator.languages?.length ? navigator.languages : [navigator.language], Intl),
    },
  });
runtime.settings = settings;
if (!hotData?.preferences) {
  settings.load();
}
const apps =
  hotData?.apps ||
  createAppsService({
    catalog: runtime.catalog,
    config: runtime.config,
    platform: createAppsPlatform(window),
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
  });
runtime.apps = apps;
const network =
  hotData?.network ||
  createNetworkService({
    platform: createNetworkPlatform(window),
    settings,
    timers: window,
  });
runtime.network = network;
const weather =
  hotData?.weather ||
  createWeatherService({
    platform: createWeatherPlatform(window),
    settings,
    clock,
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    now: () => Date.now(),
    timers: window,
  });
runtime.weather = weather;
const continueWatching =
  hotData?.continueWatching ||
  runtime.continueWatching ||
  createContinueWatchingService({
    apps: runtime.apps,
    clock,
    elapsed: () => performance.now(),
    now: () => Date.now(),
    platform: createContinueWatchingPlatform(window),
    providers: runtime.continueWatchingProviders || [],
    settings,
    timers: window,
  });
runtime.continueWatching = continueWatching;
const backgrounds = mountBackgrounds(
  backgroundHost,
  weatherPhotoHost,
  runtime,
  weather,
  hotData && hotData.backgrounds,
);
window.Backgrounds = backgrounds.bridge;
const platform = { backgrounds: backgrounds.bridge, previewBackground: backgrounds.previewBackground };
const toast = mountToast(toastHost);
const fireplace = mountFireplace(fireplaceHost, (key, values) => runtime.translate(key, values));
const previousFireplace = window.Fireplace;
window.Fireplace = fireplace.bridge;
const previousCommands = {
  applyBackground: runtime.applyBackground,
  toast: runtime.toast,
  hideToast: runtime.hideToast,
};
Object.assign(runtime, toast.bridge, { applyBackground: backgrounds.apply });
const dispose = () => {
  Object.assign(runtime, previousCommands);
  window.Fireplace = previousFireplace;
  fireplace.dispose();
  toast.dispose();
  backgrounds.dispose();
};

try {
  const app = createLauncherApp(
    runtime,
    platform,
    { home, settings: settingsHost },
    { home: mountHome, settings: mountSettings },
    createLauncherUpdates(version.trim()),
    settings,
  );
  if (import.meta.hot && hotData) {
    if (hotData.backgrounds) {
      runtime.applyBackground();
    }
    import.meta.hot.accept();
    import.meta.hot.dispose(() => {
      hotData.backgrounds = backgrounds.getState();
      hotData.apps = apps;
      hotData.clock = clock;
      hotData.preferences = settings;
      hotData.network = network;
      hotData.weather = weather;
      hotData.continueWatching = continueWatching;
      app.dispose();
      dispose();
    });
  }
} catch (error) {
  dispose();
  throw error;
}
