import { needsWebGL } from "../../contracts/backgrounds";
import type { LauncherPlatform, LauncherRuntime } from "../../platform/tizen/launcherRuntime";
import { describeApp } from "../../shared/apps/appPresentation";
import type { SettingsServices } from "../types";

// All dependencies on unmigrated modules are kept at this boundary. Components
// receive data/commands; none can call the legacy tile DOM constructors.
export const createSettingsServices = (runtime: LauncherRuntime, platform: LauncherPlatform): SettingsServices => {
  const artworkEnvironment = { tv: !!runtime.tizen };
  return {
    config: runtime.config,
    clock: runtime.clock,
    weather: runtime.weather,
    backgrounds: platform.backgrounds.list.map((background) => ({
      ...background,
      preview: platform.backgrounds.preview(background),
      requiresWebGL: needsWebGL(background),
    })),
    backgroundWebGL: platform.backgrounds.webGL,
    describeApp: (app) => describeApp(app, artworkEnvironment),
    searchLocations: (query, done) => runtime.weather.searchLocations(query, done),
    applyBackground: () => runtime.applyBackground(),
    previewBackground: (preview) => platform.previewBackground(preview),
    applySpeed: (speed) => platform.backgrounds.setSpeed(speed),
    applyClock: () => runtime.clock.tick(),
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
    canLearnIpControlInput: () => runtime.inputs.canLearnIpControlInput(),
    async learnIpControlInput() {
      const result = await runtime.inputs.learnIpControlInput();
      if (result.status === "added") {
        runtime.toast(runtime.translate("inputs.ipProbe.added", { port: result.port }));
      }
      return result;
    },
  };
};
