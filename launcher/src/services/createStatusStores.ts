import type { SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createStore } from "../shared/state/createStore";

// Views share one subscription to each existing service. They never start a
// poller or make a forecast request. Clock ticks also recheck cache expiry.
export const createStatusStores = (
  runtime: Pick<LauncherRuntime, "clock" | "network">,
  platform: Pick<LauncherPlatform, "weather">,
  transaction: (action: () => void) => void,
  settings: SettingsStore,
): StatusStores => {
  const time = createStore(runtime.clock.getSnapshot());
  const weather = createStore(platform.weather.getSnapshot());
  const network = createStore(runtime.network.getSnapshot());
  const unsubscribers = [
    runtime.clock.subscribe(() =>
      transaction(() => {
        time.set(runtime.clock.getSnapshot());
        weather.set(platform.weather.getSnapshot());
      }),
    ),
    platform.weather.subscribe(() => transaction(() => weather.set(platform.weather.getSnapshot()))),
    runtime.network.subscribe(() => transaction(() => network.set(runtime.network.getSnapshot()))),
    settings.subscribe(() =>
      transaction(() => {
        weather.set(platform.weather.getSnapshot());
        network.set(runtime.network.getSnapshot());
      }),
    ),
  ];
  return {
    time,
    weather,
    network,
    dispose() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  };
};
