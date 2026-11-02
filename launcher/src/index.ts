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
const app = createLauncherApp(runtime, platform, { home, settings }, { home: mountHome, settings: mountSettings });
// The legacy services keep their lifecycle during a development view remount.
// Repaint their cached status into the new hosts without restarting their timers.
if (runtime.apps.ready) {
  runtime.clock.tick();
  platform.weather.updateDisplay();
  runtime.network.updateVisibility();
  runtime.network.refresh();
}
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(app.dispose);
}
