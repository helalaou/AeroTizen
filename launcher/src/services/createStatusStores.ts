import type { SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createStore } from "../shared/state/createStore";

// Clock and weather still bridge existing services. Network views read the shared
// service directly. Clock ticks also recheck weather cache expiry.
export const createStatusStores = (
  runtime: Pick<LauncherRuntime, "clock" | "network">,
  platform: Pick<LauncherPlatform, "weather">,
  transaction: (action: () => void) => void,
  settings: SettingsStore,
): StatusStores => {
  const time = createStore(runtime.clock.getSnapshot());
  const weather = createStore(platform.weather.getSnapshot());
  const unsubscribers = [
    runtime.clock.subscribe(() =>
      transaction(() => {
        time.set(runtime.clock.getSnapshot());
        weather.set(platform.weather.getSnapshot());
      }),
    ),
    platform.weather.subscribe(() => transaction(() => weather.set(platform.weather.getSnapshot()))),
    settings.subscribe(() =>
      transaction(() => {
        weather.set(platform.weather.getSnapshot());
      }),
    ),
  ];
  return {
    time,
    weather,
    network: runtime.network,
    dispose() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  };
};
