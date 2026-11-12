import version from "../version.txt?raw";

import { bindLauncherKeys } from "./app/bindLauncherKeys";
import { createLauncherApp } from "./app/createLauncherApp";
import { launcherRuntime as runtime } from "./app/initializeLauncherRuntime";
import { mountToast } from "./app/mountToast";
import { startLauncherBoot } from "./app/startLauncherBoot";
import type { BackgroundState } from "./backgrounds/createBackgrounds";
import { mountBackgrounds } from "./backgrounds/mountBackgrounds";
import type { AppsService } from "./contracts/apps";
import type { ContinueWatchingService } from "./contracts/continueWatching";
import type { HomeWatcherService } from "./contracts/homeWatcher";
import type { InputsService } from "./contracts/inputs";
import type { ClockService } from "./contracts/launcher";
import type { NativeNavigation } from "./contracts/nativeNavigation";
import type { SettingsService } from "./contracts/preferences";
import type { NetworkService, WeatherService } from "./contracts/status";
import { createFireplaceKeyHandler } from "./fireplace/createFireplaceKeyHandler";
import { mountFireplace } from "./fireplace/mountFireplace";
import { mountHome } from "./home/index";
import { mountInputPlayback } from "./inputs/mountInputPlayback";
import { createAppsPlatform } from "./platform/tizen/createAppsPlatform";
import { createClockPlatform } from "./platform/tizen/createClockPlatform";
import { createContinueWatchingPlatform } from "./platform/tizen/createContinueWatchingPlatform";
import { createHomeWatcherPlatform } from "./platform/tizen/createHomeWatcherPlatform";
import { createInputsPlatform } from "./platform/tizen/createInputsPlatform";
import { createNativeNavigation } from "./platform/tizen/createNativeNavigation";
import { createNetworkPlatform } from "./platform/tizen/createNetworkPlatform";
import { createSamsungContinueWatchingProvider } from "./platform/tizen/createSamsungContinueWatchingProvider";
import { createStremioContinueWatchingProvider } from "./platform/tizen/createStremioContinueWatchingProvider";
import { createWeatherPlatform } from "./platform/tizen/createWeatherPlatform";
import { defaultTemperatureUnit } from "./platform/tizen/defaultTemperatureUnit";
import { createAppsService } from "./services/createAppsService";
import { createClockService } from "./services/createClockService";
import { createContinueWatchingService } from "./services/createContinueWatchingService";
import { createHomeWatcherService } from "./services/createHomeWatcherService";
import { createInputsService } from "./services/createInputsService";
import { createLauncherUpdates } from "./services/createLauncherUpdates";
import { createNetworkService } from "./services/createNetworkService";
import { createSettingsService } from "./services/createSettingsService";
import { createWeatherService } from "./services/createWeatherService";
import { mountSettings } from "./settings/index";
import { appCatalog } from "./shared/apps/appCatalog";

const createPlatform = <Platform>(create: () => Platform, override?: (platform: Platform) => Platform) => {
  const platform = create();
  return override?.(platform) ?? platform;
};

const backgroundHost = document.getElementById("bg");
const home = document.getElementById("home-root");
const settingsHost = document.getElementById("settings-root");
const toastHost = document.getElementById("toast-root");
const weatherPhotoHost = document.getElementById("weather-photo-root");
const fireplaceHost = document.getElementById("fireplace-root");
const inputPlaybackHost = document.getElementById("input-playback-root");
if (
  !backgroundHost ||
  !home ||
  !settingsHost ||
  !toastHost ||
  !weatherPhotoHost ||
  !fireplaceHost ||
  !inputPlaybackHost
) {
  throw new Error("Launcher mount points are missing.");
}
const hotData = import.meta.hot
  ? (import.meta.hot.data as {
      backgrounds?: BackgroundState;
      apps?: AppsService;
      clock?: ClockService;
      continueWatching?: ContinueWatchingService;
      inputs?: InputsService;
      homewatch?: HomeWatcherService;
      nativeNavigation?: NativeNavigation;
      network?: NetworkService;
      preferences?: SettingsService;
      stopBoot?: () => void;
      weather?: WeatherService;
    })
  : undefined;
const homewatch =
  hotData?.homewatch ||
  createHomeWatcherService({
    appId: runtime.config.APP_ID,
    catalog: appCatalog,
    now: () => Date.now(),
    platform: createHomeWatcherPlatform(window),
    timers: window,
  });
runtime.homewatch = homewatch;
const nativeNavigation = hotData?.nativeNavigation || createNativeNavigation(window);
runtime.nativeNavigation = nativeNavigation;
runtime.homewatch = { ...runtime.homewatch, ...nativeNavigation.commands };
nativeNavigation.start();
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
    catalog: appCatalog,
    config: runtime.config,
    platform: createPlatform(() => createAppsPlatform(window), runtime.platforms?.apps),
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
  });
runtime.apps = apps;
const inputs =
  hotData?.inputs ||
  createInputsService({
    platform: createPlatform(() => createInputsPlatform(window), runtime.platforms?.inputs),
    settings,
    timers: window,
    translate: (key, values) => runtime.translate(key, values),
    toast: (message) => runtime.toast(message),
  });
runtime.inputs = inputs;
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
    providers: [
      createStremioContinueWatchingProvider({
        catalog: appCatalog,
        runtime,
        createRequest: () => new XMLHttpRequest(),
        timers: window,
      }),
      createSamsungContinueWatchingProvider({
        catalog: appCatalog,
        runtime,
        createRequest: () => new XMLHttpRequest(),
        now: () => Date.now(),
      }),
    ],
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
const disposeInputPlayback = mountInputPlayback(inputPlaybackHost, {
  inputs,
  applyBackground: backgrounds.apply,
  suspendBackground: backgrounds.bridge.suspend,
});
const dispose = () => {
  disposeInputPlayback();
  Object.assign(runtime, previousCommands);
  window.Fireplace = previousFireplace;
  fireplace.dispose();
  toast.dispose();
  backgrounds.dispose();
};

let disposeApp: (() => void) | undefined;
let unbindKeys: (() => void) | undefined;
try {
  const app = createLauncherApp(
    runtime,
    platform,
    { home, settings: settingsHost },
    { home: mountHome, settings: mountSettings },
    createLauncherUpdates(version.trim()),
    settings,
  );
  disposeApp = app.dispose;
  unbindKeys = bindLauncherKeys(document, runtime.config.KEY, {
    fireplace: createFireplaceKeyHandler(runtime.config.KEY, fireplace.bridge),
    home: app.home,
    inputs,
    settings: app.settings,
  });
  const stopBoot = hotData?.stopBoot ?? startLauncherBoot(window, runtime, window.AeroStartup);
  if (import.meta.hot && hotData) {
    if (hotData.backgrounds) {
      runtime.applyBackground();
    }
    import.meta.hot.accept();
    import.meta.hot.prune(stopBoot);
    import.meta.hot.dispose(() => {
      hotData.backgrounds = backgrounds.getState();
      hotData.apps = apps;
      hotData.inputs = inputs;
      hotData.homewatch = homewatch;
      hotData.nativeNavigation = nativeNavigation;
      hotData.clock = clock;
      hotData.preferences = settings;
      hotData.network = network;
      hotData.weather = weather;
      hotData.continueWatching = continueWatching;
      hotData.stopBoot = stopBoot;
      unbindKeys?.();
      app.dispose();
      dispose();
    });
  }
} catch (error) {
  unbindKeys?.();
  disposeApp?.();
  dispose();
  throw error;
}
