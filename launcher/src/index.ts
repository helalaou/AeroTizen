import { flushSync } from "preact/compat";

import { createLauncherApp } from "./app/createLauncherApp";
import { mountHome } from "./home/index";
import { mountSettings } from "./settings/index";

const home = document.getElementById("home-root");
const settings = document.getElementById("settings-root");
if (!home || !settings) {
  throw new Error("Launcher mount points are missing.");
}
const runtime = window.AeroTizen;
const platform = { backgrounds: window.Backgrounds, weather: window.Weather };
const app = createLauncherApp(
  runtime,
  platform,
  { home, settings },
  { home: mountHome, settings: mountSettings },
  flushSync,
);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(app.dispose);
}
