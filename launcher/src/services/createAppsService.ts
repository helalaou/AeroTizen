import type { AppRecord, AppsConfig, AppsPlatform, AppsService, AppsSnapshot } from "../contracts/apps";
import type { InstalledApp } from "../contracts/launcher";
import { createStore } from "../shared/state/createStore";
import { equalRecord } from "../shared/state/equalRecord";
import { snapshotList } from "../shared/state/snapshotList";

import { demoApps } from "./apps/demoApps";

interface AppsDependencies {
  catalog: { preloadedStoreId(id: string): string | null };
  config: AppsConfig;
  platform: AppsPlatform;
  storage: Pick<Storage, "getItem" | "setItem">;
}

const CACHE_KEY = "aerotizen.apps.v1";
const MAX_CACHED_APPS = 1000;

const appRecords = (value: unknown): AppRecord[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const records: AppRecord[] = [];
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const app = entry as Record<string, unknown>;
    if (typeof app.id !== "string" || !app.id) {
      continue;
    }
    records.push({
      id: app.id,
      ...(typeof app.name === "string" ? { name: app.name } : {}),
      ...(typeof app.packageId === "string" ? { packageId: app.packageId } : {}),
      ...(typeof app.iconPath === "string" ? { iconPath: app.iconPath } : {}),
      ...(typeof app.show === "boolean" ? { show: app.show } : {}),
    });
  }
  return records;
};

export const createAppsService = ({ catalog, config, platform, storage }: AppsDependencies): AppsService => {
  const store = createStore<AppsSnapshot>(
    Object.freeze({
      all: Object.freeze([]),
      inventory: Object.freeze([]),
      realIds: Object.freeze([]),
      ready: false,
    }),
  );
  let disposed = false;
  const discoveryListeners = new Set<() => void>();
  let pending: (() => void) | undefined;

  const publish = (
    all: readonly InstalledApp[],
    inventory: readonly AppRecord[],
    realIds: readonly string[],
    ready: boolean,
  ) => {
    const previous = store.getSnapshot();
    const byId = new Map(previous.all.map((app) => [app.id, app]));
    const records = all.map((app) => {
      const old = byId.get(app.id);
      return old && equalRecord(old, app) ? old : Object.freeze({ ...app });
    });
    const nextApps =
      records.length === previous.all.length && records.every((app, index) => app === previous.all[index])
        ? previous.all
        : Object.freeze(records);
    const nextInventory = snapshotList(inventory, previous.inventory);
    const nextIds =
      realIds.length === previous.realIds.length && realIds.every((id, index) => id === previous.realIds[index])
        ? previous.realIds
        : Object.freeze([...realIds]);
    if (
      nextApps !== previous.all ||
      nextInventory !== previous.inventory ||
      nextIds !== previous.realIds ||
      ready !== previous.ready
    ) {
      store.set(Object.freeze({ all: nextApps, inventory: nextInventory, realIds: nextIds, ready }));
    }
  };
  const isRealApp = (app: AppRecord) =>
    app.show !== false && (config.STORE_PACKAGE.test(app.packageId || "") || !!catalog.preloadedStoreId(app.id));
  const service: AppsService = {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    subscribeDiscovery(listener) {
      discoveryListeners.add(listener);
      return () => {
        discoveryListeners.delete(listener);
      };
    },
    restore() {
      if (disposed || store.getSnapshot().ready) {
        return;
      }
      try {
        const value: unknown = JSON.parse(storage.getItem(CACHE_KEY) || "[]");
        if (!Array.isArray(value) || value.length > MAX_CACHED_APPS) {
          return;
        }
        const cached = (value as unknown[])
          .filter(
            (app): app is Required<Pick<InstalledApp, "id" | "name" | "icon">> =>
              !!app &&
              typeof app === "object" &&
              typeof (app as InstalledApp).id === "string" &&
              !!(app as InstalledApp).id &&
              typeof (app as InstalledApp).name === "string" &&
              !!(app as InstalledApp).name &&
              typeof (app as InstalledApp).icon === "string",
          )
          .map(({ id, name, icon }) => ({ id, name, icon }));
        const previous = store.getSnapshot();
        publish(cached, previous.inventory, previous.realIds, false);
      } catch {
        // Cached labels are optional. Discovery failure must not remove favourites.
      }
    },
    load(done) {
      if (disposed) {
        done?.(false);
        return;
      }
      pending?.();
      let active = true;
      let cancelRead = () => {};
      const cancel = () => {
        if (!active) {
          return;
        }
        active = false;
        cancelRead();
        done?.(false);
      };
      pending = cancel;
      const finish = (records: unknown) => {
        if (!active || disposed) {
          return;
        }
        active = false;
        if (pending === cancel) {
          pending = undefined;
        }
        const inventory = appRecords(records);
        if (!inventory) {
          done?.(false);
          return;
        }
        const realIds = inventory
          .filter((app) => (isRealApp(app) || app.id === config.HBBTV_APP_ID) && !/service|DclHome001/i.test(app.id))
          .map((app) => catalog.preloadedStoreId(app.id) || app.id);
        const all = inventory
          .filter(
            (app) =>
              isRealApp(app) && app.name && !config.HIDDEN_APPS.test(app.id) && !config.HIDDEN_APPS.test(app.name),
          )
          .map((app) => ({ id: app.id, name: app.name || "", icon: app.iconPath || "" }))
          .sort((left, right) => left.name.localeCompare(right.name));
        publish(platform.preview ? demoApps : all, inventory, realIds, true);
        // Returning from another app can carry new playback data without an inventory change.
        if (!disposed) {
          [...discoveryListeners].forEach((listener) => listener());
        }
        try {
          if (!platform.preview) {
            storage.setItem(CACHE_KEY, JSON.stringify(store.getSnapshot().all));
          }
        } catch {
          // A full or unavailable cache does not fail package discovery.
        }
        done?.(!disposed);
      };
      if (platform.preview) {
        finish([]);
      } else {
        cancelRead = platform.readInstalled(finish);
        if (!active) {
          cancelRead();
        }
      }
    },
    byId(id) {
      const snapshot = store.getSnapshot();
      const found = snapshot.all.find((app) => app.id === id);
      return found || (snapshot.ready ? null : Object.freeze({ id, name: id, icon: "" }));
    },
    defaultHome() {
      const picked = new Set<string>();
      config.DEFAULT_HOME_APPS.forEach((prefix) => {
        store.getSnapshot().all.forEach((app) => {
          if (app.name.toLowerCase().startsWith(prefix)) {
            picked.add(app.id);
          }
        });
      });
      return [config.FIREPLACE_ID, ...picked];
    },
    launch(app) {
      if (!disposed) {
        platform.launch(app, () => service.load());
      }
    },
    openStore() {
      if (!disposed) {
        platform.openStore();
      }
    },
    playFireplace() {
      if (!disposed) {
        platform.playFireplace(store.getSnapshot().all);
      }
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        pending?.();
        pending = undefined;
        discoveryListeners.clear();
        platform.dispose();
      }
    },
  };
  return service;
};
