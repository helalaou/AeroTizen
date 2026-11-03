import type { SettingsSnapshot, SettingsSource, SettingsStore, SettingsValues } from "../contracts/preferences";
import { createStore } from "../shared/state/createStore";
import { equalRecord } from "../shared/state/equalRecord";

const getLocationSnapshot = (
  location: SettingsValues["weatherLocation"],
  previous?: SettingsSnapshot["weatherLocation"],
) => {
  if (!location) {
    return null;
  }
  if (previous && equalRecord(previous, location)) {
    return previous;
  }
  return Object.freeze({ ...location });
};

export const createSettingsStore = (source: SettingsSource, defaults: SettingsValues): SettingsStore => {
  const read = (previous?: SettingsSnapshot): SettingsSnapshot => {
    const values = (Object.keys(defaults) as (keyof SettingsValues)[]).reduce(
      (values, key) => (source[key] === undefined ? values : { ...values, [key]: source[key] }),
      defaults,
    );
    const home = values.home || [];
    const continueApps = values.continueWatchingApps || [];
    const inputNames = values.inputNames || {};
    const hdmiKeepVisible = values.hdmiKeepVisible || {};
    const weatherLocation = values.weatherLocation;
    const next = Object.freeze({
      ...values,
      homeInitialized: source.home !== null && source.home !== undefined,
      hdmiKeepVisible:
        previous && equalRecord(previous.hdmiKeepVisible, hdmiKeepVisible)
          ? previous.hdmiKeepVisible
          : Object.freeze({ ...hdmiKeepVisible }),
      continueWatchingApps:
        previous && equalRecord(previous.continueWatchingApps, continueApps)
          ? previous.continueWatchingApps
          : Object.freeze([...continueApps]),
      home: previous && equalRecord(previous.home, home) ? previous.home : Object.freeze([...home]),
      inputNames:
        previous && equalRecord(previous.inputNames, inputNames)
          ? previous.inputNames
          : Object.freeze({ ...inputNames }),
      weatherLocation: getLocationSnapshot(weatherLocation, previous?.weatherLocation),
    });
    return previous && equalRecord(previous, next) ? previous : next;
  };
  const store = createStore(read());
  const refresh = () => store.set(read(store.getSnapshot()));
  const unsubscribe = source.subscribe(refresh);
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    refresh,
    update(patch) {
      // This compatibility boundary writes through to the existing global service.
      Object.assign(source, patch);
      source.save();
    },
    dispose: unsubscribe,
  };
};
