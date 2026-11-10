import type { SettingsStore } from "../../contracts/preferences";
import type { LauncherRuntime } from "../../platform/tizen/launcherRuntime";
import { createStore } from "../../shared/state/createStore";
import type { Inventory } from "../types";

export const createHomeInventory = (
  runtime: Pick<LauncherRuntime, "apps" | "inputs" | "continueWatching">,
  settings: SettingsStore,
  transaction: (action: () => void) => void,
) => {
  const read = (previous?: Inventory): Inventory => {
    const appSnapshot = runtime.apps.getSnapshot();
    const apps = appSnapshot.all;
    const inputs = runtime.inputs.getSnapshot().visibleSources;
    const items = runtime.continueWatching.getSnapshot().items;
    const ready = appSnapshot.ready;
    return previous &&
      apps === previous.apps &&
      inputs === previous.inputs &&
      items === previous.items &&
      ready === previous.ready
      ? previous
      : Object.freeze({ apps, inputs, items, ready });
  };
  const store = createStore(read());
  const refresh = () => transaction(() => store.set(read(store.getSnapshot())));
  const unsubscribers = [
    runtime.apps.subscribe(refresh),
    runtime.inputs.subscribe(refresh),
    runtime.continueWatching.subscribe(refresh),
    settings.subscribe(refresh),
  ];
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    refresh,
    dispose() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
  };
};
