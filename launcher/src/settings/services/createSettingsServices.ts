import { needsWebGL } from "../../contracts/backgrounds";
import type { LauncherPlatform, LauncherRuntime } from "../../platform/tizen/launcherRuntime";
import type { SettingsServices } from "../types";

// All dependencies on unmigrated modules are kept at this boundary. Components
// receive data/commands; none can call the legacy tile DOM constructors.
export const createSettingsServices = (runtime: LauncherRuntime, platform: LauncherPlatform): SettingsServices => ({
  config: runtime.config,
  clock: runtime.clock,
  weather: runtime.weather,
  backgrounds: platform.backgrounds.list.map((background) => ({
    ...background,
    preview: platform.backgrounds.preview(background),
    requiresWebGL: needsWebGL(background),
  })),
  backgroundWebGL: platform.backgrounds.webGL,
  describeApp: (app) => runtime.tiles.describe(app),
  searchLocations: (query, done) => runtime.weather.searchLocations(query, done),
  applyBackground: () => runtime.applyBackground(),
  previewBackground: (preview) => platform.previewBackground(preview),
  applySpeed: (speed) => platform.backgrounds.setSpeed(speed),
  applyClock: () => runtime.clock.tick(),
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
    runtime.homeScreen?.render();
  },
  clearHomeFocus: () => runtime.homeScreen?.blur(),
  showPreviewMessage: () => runtime.toast(runtime.translate("wallpaper.previewing")),
  hidePreviewMessage: () => runtime.hideToast(),
});
