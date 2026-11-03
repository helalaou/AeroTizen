import { flushSync } from "preact/compat";

import { createLauncherApp } from "./app/createLauncherApp";
import type { BackgroundState } from "./backgrounds/createBackgrounds";
import { mountBackgrounds } from "./backgrounds/mountBackgrounds";
import { mountHome } from "./home/index";
import { mountSettings } from "./settings/index";

const backgroundHost = document.getElementById("bg");
const home = document.getElementById("home-root");
const settings = document.getElementById("settings-root");
if (!backgroundHost || !home || !settings) {
  throw new Error("Launcher mount points are missing.");
}
const runtime = window.AeroTizen;
const hotData = import.meta.hot?.data as { backgrounds?: BackgroundState } | undefined;
const backgrounds = mountBackgrounds(backgroundHost, hotData?.backgrounds);
window.Backgrounds = backgrounds.bridge;
const platform = { backgrounds: backgrounds.bridge, weather: window.Weather };

try {
  const app = createLauncherApp(
    runtime,
    platform,
    { home, settings },
    { home: mountHome, settings: mountSettings },
    flushSync,
  );
  if (import.meta.hot && hotData) {
    import.meta.hot.accept();
    import.meta.hot.dispose(() => {
      hotData.backgrounds = backgrounds.getState();
      app.dispose();
      backgrounds.dispose();
    });
  }
} catch (error) {
  backgrounds.dispose();
  throw error;
}
