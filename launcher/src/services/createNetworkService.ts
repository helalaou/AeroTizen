import type { SettingsStore } from "../contracts/preferences";
import type { NetworkPlatform, NetworkService, NetworkSnapshot } from "../contracts/status";
import { createStore } from "../shared/state/createStore";

const REFRESH_INTERVAL_MS = 60_000;

export const createNetworkService = ({
  platform,
  settings,
  timers,
}: {
  platform: NetworkPlatform;
  settings: Pick<SettingsStore, "getSnapshot" | "subscribe">;
  timers: Pick<Window, "setInterval" | "clearInterval">;
}): NetworkService => {
  const store = createStore<NetworkSnapshot>(
    Object.freeze({
      kind: "unknown",
      strength: null,
      visible: settings.getSnapshot().showNetwork,
    }),
  );
  const subscriptions = new Set<() => void>();
  let disposed = false;
  let started = false;
  let generation = 0;
  let interval: number | undefined;
  let cancelRead: (() => void) | undefined;
  let unwatch: (() => void) | undefined;
  const publish = (kind: NetworkSnapshot["kind"], strength: number | null) => {
    if (disposed) {
      return;
    }
    const before = store.getSnapshot();
    const visible = settings.getSnapshot().showNetwork;
    if (before.kind !== kind || before.strength !== strength || before.visible !== visible) {
      store.set(Object.freeze({ kind, strength, visible }));
    }
  };
  const unsubscribeSettings = settings.subscribe(() => {
    const before = store.getSnapshot();
    publish(before.kind, before.strength);
  });
  const refresh = () => {
    if (disposed) {
      return;
    }
    cancelRead?.();
    cancelRead = undefined;
    const request = ++generation;
    const cancel = platform.read((reading) => {
      if (!disposed && request === generation) {
        publish(reading.kind, reading.strength);
      }
    });
    if (disposed || request !== generation) {
      cancel();
    } else {
      cancelRead = cancel;
    }
  };
  return {
    getSnapshot: store.getSnapshot,
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      const unsubscribe = store.subscribe(listener);
      subscriptions.add(unsubscribe);
      return () => {
        subscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },
    refresh,
    start() {
      if (disposed || started) {
        return;
      }
      started = true;
      unwatch = platform.subscribe(refresh);
      interval = timers.setInterval(refresh, REFRESH_INTERVAL_MS);
      refresh();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      generation++;
      cancelRead?.();
      if (interval !== undefined) {
        timers.clearInterval(interval);
      }
      unwatch?.();
      unsubscribeSettings();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions.clear();
    },
  };
};
