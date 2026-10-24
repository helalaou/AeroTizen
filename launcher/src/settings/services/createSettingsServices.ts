import type { SettingsServices } from '../types';
import type { LauncherRuntime } from './launcherRuntime';

// All dependencies on unmigrated modules are kept at this boundary. Components
// receive data/commands; none can call the legacy tile DOM constructors.
export const createSettingsServices = (runtime: LauncherRuntime): SettingsServices => ({
  config: runtime.config,
  clock: {
    dateStyle: runtime.clock.dateStyle,
    formatTime: runtime.clock.formatTime,
    DATE_FORMATS: runtime.clock.DATE_FORMATS
  },
  backgrounds: window.Backgrounds.list.map(background => ({ ...background, preview: window.Backgrounds.preview(background) })),
  describeApp: app => runtime.tiles.describe(app),
  searchLocations(query, done) {
    let cancelled = false;
    window.Weather.searchLocations(query, results => { if (!cancelled) { done(results); } });
    // The old client cannot abort transport; cancellation suppresses delivery.
    return () => { cancelled = true; };
  },
  applyBackground: () => runtime.applyBackground(),
  applySpeed: speed => window.Backgrounds.setSpeed(speed),
  applyClock: () => runtime.clock.tick(),
  applyWeatherVisibility: () => window.Weather.updateVisibility(),
  applyLocationVisibility: () => window.Weather.updateDisplay(),
  refreshWeather: () => window.Weather.refresh(),
  applyNetworkVisibility: () => runtime.network.updateVisibility(),
  applyInputs: () => runtime.inputs.render(),
  applyCardSize: () => runtime.homeScreen.render(),
  openStore: () => runtime.apps.openStore(),
  useSamsungHome: () => runtime.homewatch.useSamsungHome(),
  finishEditing() { runtime.settings.save(); runtime.homeScreen.render(); },
  clearHomeFocus: () => runtime.clearFocus(),
  showPreviewMessage: () => runtime.toast('Previewing. Press any key to return'),
  hidePreviewMessage: () => runtime.hideToast()
});
