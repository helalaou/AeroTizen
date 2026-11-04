import { flushSync } from "preact/compat";

import version from "../version.txt?raw";

import { createLauncherApp } from "./app/createLauncherApp";
import { mountToast } from "./app/mountToast";
import type { BackgroundState } from "./backgrounds/createBackgrounds";
import { mountBackgrounds } from "./backgrounds/mountBackgrounds";
import { mountFireplace } from "./fireplace/mountFireplace";
import { mountHome } from "./home/index";
import { createLauncherUpdates } from "./services/createLauncherUpdates";
import { mountSettings } from "./settings/index";

const backgroundHost = document.getElementById("bg");
const home = document.getElementById("home-root");
const settings = document.getElementById("settings-root");
const toastHost = document.getElementById("toast-root");
const weatherPhotoHost = document.getElementById("weather-photo-root");
const fireplaceHost = document.getElementById("fireplace-root");
if (!backgroundHost || !home || !settings || !toastHost || !weatherPhotoHost || !fireplaceHost) {
  throw new Error("Launcher mount points are missing.");
}
const runtime = window.AeroTizen;
const hotData = import.meta.hot ? (import.meta.hot.data as { backgrounds?: BackgroundState }) : undefined;
const weather = window.Weather;
const backgrounds = mountBackgrounds(
  backgroundHost,
  weatherPhotoHost,
  runtime,
  weather,
  hotData && hotData.backgrounds,
);
window.Backgrounds = backgrounds.bridge;
const platform = { backgrounds: backgrounds.bridge, weather };
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
    { home, settings },
    { home: mountHome, settings: mountSettings },
    createLauncherUpdates(version.trim()),
    flushSync,
  );
  if (import.meta.hot && hotData) {
    if (hotData.backgrounds) {
      runtime.applyBackground();
    }
    import.meta.hot.accept();
    import.meta.hot.dispose(() => {
      hotData.backgrounds = backgrounds.getState();
      app.dispose();
      dispose();
    });
  }
} catch (error) {
  dispose();
  throw error;
}
