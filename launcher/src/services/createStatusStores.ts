import type { SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createStore } from "../shared/state/createStore";

// Views read the clock and network services directly. Recheck weather cache expiry on each clock tick.
export const createStatusStores = (
  runtime: Pick<LauncherRuntime, "clock" | "network">,
  platform: Pick<LauncherPlatform, "weather">,
  transaction: (action: () => void) => void,
  settings: SettingsStore,
): StatusStores => {
  const weather = createStore(platform.weather.getSnapshot());
  const syncWeather = () => transaction(() => weather.set(platform.weather.getSnapshot()));
  const unsubscribers = [
    runtime.clock.subscribe(syncWeather),
    platform.weather.subscribe(syncWeather),
    settings.subscribe(syncWeather),
  ];
  return {
    time: runtime.clock,
    weather,
    network: runtime.network,
    dispose() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  };
};
