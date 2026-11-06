import type {
  SettingsDefaults,
  SettingsPreferences,
  SettingsService,
  SettingsSnapshot,
} from "../contracts/preferences";
import { createStore } from "../shared/state/createStore";
import { equalRecord } from "../shared/state/equalRecord";

import { DEFAULT_SETTINGS } from "./preferences/defaults";
import { migrateSettings } from "./preferences/migrateSettings";
import { normalizeSettings } from "./preferences/normalizeSettings";

export interface SettingsServiceOptions {
  defaults?: Partial<SettingsDefaults>;
  legacyStorageKeys: readonly string[];
  locale: { timeFormat(): "12" | "24"; tempUnit(): "C" | "F" };
  speedRange: { MIN: number; MAX: number };
  storage: Pick<Storage, "getItem" | "setItem">;
  storageKey: string;
}

const snapshot = (values: SettingsPreferences, previous?: SettingsSnapshot): SettingsSnapshot => {
  const next = Object.freeze({
    ...values,
    homeInitialized: values.home !== null,
    customGradient:
      previous && equalRecord(previous.customGradient, values.customGradient)
        ? previous.customGradient
        : Object.freeze({ ...values.customGradient }),
    home:
      previous && equalRecord(previous.home, values.home || [])
        ? previous.home
        : Object.freeze([...(values.home || [])]),
    continueWatchingApps:
      previous && equalRecord(previous.continueWatchingApps, values.continueWatchingApps)
        ? previous.continueWatchingApps
        : Object.freeze([...values.continueWatchingApps]),
    inputNames:
      previous && equalRecord(previous.inputNames, values.inputNames)
        ? previous.inputNames
        : Object.freeze({ ...values.inputNames }),
    hdmiKeepVisible:
      previous && equalRecord(previous.hdmiKeepVisible, values.hdmiKeepVisible)
        ? previous.hdmiKeepVisible
        : Object.freeze({ ...values.hdmiKeepVisible }),
    weatherLocation:
      previous && equalRecord(previous.weatherLocation || {}, values.weatherLocation || {})
        ? previous.weatherLocation
        : values.weatherLocation && Object.freeze({ ...values.weatherLocation }),
  });
  return previous && equalRecord(previous, next) ? previous : next;
};

export const createSettingsService = (options: SettingsServiceOptions): SettingsService => {
  const defaults = { ...DEFAULT_SETTINGS, ...options.defaults };
  const normalize = (value: unknown) => normalizeSettings(value, defaults, options.locale, options.speedRange);
  const store = createStore(snapshot(normalize(defaults)));
  const subscriptions = new Set<() => void>();
  let disposed = false;
  const values = (state: SettingsSnapshot) => {
    const { homeInitialized, ...preferences } = state;
    return { ...preferences, home: homeInitialized ? [...state.home] : null };
  };
  const persist = (state: SettingsSnapshot) => {
    try {
      options.storage.setItem(options.storageKey, JSON.stringify(values(state)));
    } catch {
      // Preferences remain usable for this session if storage is full or blocked.
    }
  };
  const commit = (value: unknown) => {
    if (disposed) {
      return;
    }
    const next = snapshot(normalize(value), store.getSnapshot());
    persist(next);
    store.set(next);
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
    load() {
      if (disposed) {
        return;
      }
      let saved: unknown = {};
      try {
        let raw: string | null = null;
        for (const key of [options.storageKey, ...options.legacyStorageKeys]) {
          raw = options.storage.getItem(key);
          if (raw) {
            break;
          }
        }
        saved = raw ? JSON.parse(raw) : {};
      } catch {
        // Missing, malformed or unavailable storage uses defaults.
      }
      commit(migrateSettings(saved));
    },
    update(patch) {
      commit({ ...values(store.getSnapshot()), ...patch });
    },
    dispose() {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions.clear();
    },
  };
};
