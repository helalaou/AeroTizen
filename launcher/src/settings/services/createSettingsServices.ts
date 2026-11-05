import { needsWebGL } from "../../contracts/backgrounds";
import type { LauncherPlatform, LauncherRuntime } from "../../platform/tizen/launcherRuntime";
import type { SettingsServices } from "../types";

// All dependencies on unmigrated modules are kept at this boundary. Components
// receive data/commands; none can call the legacy tile DOM constructors.
export const createSettingsServices = (runtime: LauncherRuntime, platform: LauncherPlatform): SettingsServices => ({
  config: runtime.config,
  clock: {
    dateStyle: runtime.clock.dateStyle,
    formatDate: runtime.clock.formatDate,
    subscribe: runtime.clock.subscribe,
    formatTime: runtime.clock.formatTime,
    DATE_FORMATS: runtime.clock.DATE_FORMATS,
  },
  backgrounds: platform.backgrounds.list.map((background) => ({
    ...background,
    preview: platform.backgrounds.preview(background),
    requiresWebGL: needsWebGL(background),
  })),
  backgroundWebGL: platform.backgrounds.webGL,
  describeApp: (app) => runtime.tiles.describe(app),
  searchLocations(query, done) {
    let cancelled = false;
    platform.weather.searchLocations(query, (results) => {
      if (!cancelled) {
        done(results);
      }
    });
    // The old client cannot abort transport; cancellation suppresses delivery.
    return () => {
      cancelled = true;
    };
  },
  applyBackground: () => runtime.applyBackground(),
  applySpeed: (speed) => platform.backgrounds.setSpeed(speed),
  applyClock: () => runtime.clock.tick(),
  applyWeatherVisibility: () => platform.weather.updateVisibility(),
  applyLocationVisibility: () => platform.weather.updateDisplay(),
  refreshWeather: () => platform.weather.refresh(),
  applyNetworkVisibility: () => runtime.network.updateVisibility(),
  applyInputs: () => runtime.inputs.refresh(),
  applyCardSize: () => runtime.homeScreen?.render(),
  openStore: () => runtime.apps.openStore(),
  useSamsungHome() {
    // Native navigation owns the acknowledged handoff, not physical HOME routing.
    // Keep the original escape available when that optional module is absent.
    if (runtime.homewatch.openSamsungHome) {
      runtime.homewatch.openSamsungHome();
    } else {
      runtime.homewatch.useSamsungHome();
    }
  },
  finishEditing() {
    runtime.settings.save();
    runtime.homeScreen?.render();
  },
  clearHomeFocus: () => {
    runtime.homeScreen?.blur();
    runtime.clearFocus();
  },
  showPreviewMessage: () => runtime.toast(runtime.translate("wallpaper.previewing")),
  hidePreviewMessage: () => runtime.hideToast(),
});
