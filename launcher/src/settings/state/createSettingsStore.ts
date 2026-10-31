import { createStore } from '../../shared/state/createStore';
import { equalRecord } from '../../shared/state/equalRecord';
import type { SettingsSnapshot, SettingsSource, SettingsStore, SettingsValues } from '../types';

export const createSettingsStore = (source: SettingsSource, defaults: SettingsValues): SettingsStore => {
  const read = (previous?: SettingsSnapshot): SettingsSnapshot => {
    const values = { ...defaults };
    (Object.keys(defaults) as (keyof SettingsValues)[]).forEach(key => {
      if (source[key] !== undefined) { Object.assign(values, { [key]: source[key] }); }
    });
    const home = values.home || [];
    const continueApps = values.continueWatchingApps || [];
    const inputNames = values.inputNames || {};
    const hdmiKeepVisible = values.hdmiKeepVisible || {};
    const weatherLocation = values.weatherLocation;
    const next = Object.freeze({
      ...values,
      hdmiKeepVisible: previous && equalRecord(previous.hdmiKeepVisible, hdmiKeepVisible) ? previous.hdmiKeepVisible : Object.freeze({ ...hdmiKeepVisible }),
      continueWatchingApps: previous && equalRecord(previous.continueWatchingApps, continueApps) ?
        previous.continueWatchingApps : Object.freeze([...continueApps]),
      home: previous && equalRecord(previous.home, home) ? previous.home : Object.freeze([...home]),
      inputNames: previous && equalRecord(previous.inputNames, inputNames) ? previous.inputNames : Object.freeze({ ...inputNames }),
      weatherLocation: weatherLocation ? previous?.weatherLocation && equalRecord(previous.weatherLocation, weatherLocation) ?
        previous.weatherLocation : Object.freeze({ ...weatherLocation }) : null
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
      Object.assign(source, patch);
      source.save();
    },
    dispose: unsubscribe
  };
};
