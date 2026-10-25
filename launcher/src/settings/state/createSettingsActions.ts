import type { MutableStore } from '../../shared/state/createStore';
import type { SettingsActions, SettingsServices, SettingsStore, SettingsValues, ViewState } from '../types';

export const createSettingsActions = (
  settings: SettingsStore, services: SettingsServices, view: MutableStore<ViewState>,
  transaction: (action: () => void) => void
): SettingsActions => {
  const commit = (patch: Partial<SettingsValues>, after?: () => void) => transaction(() => {
    settings.update(patch);
    after?.();
    settings.refresh();
  });
  return {
    setBackground: background => commit({ background }, services.applyBackground),
    setWeatherVisible: showWeather => commit({ showWeather }, services.applyWeatherVisibility),
    setLocationVisible: weatherShowLocation => commit({ weatherShowLocation }, services.applyLocationVisibility),
    setTempUnit: tempUnit => commit({ tempUnit }, services.refreshWeather),
    setDateFormat: dateFormat => commit({ dateFormat }, services.applyClock),
    setNetworkVisible: showNetwork => commit({ showNetwork }, services.applyNetworkVisibility),
    setLiveTvVisible: showLiveTv => commit({ showLiveTv }, services.applyInputs),
    setCardSize: cardSize => commit({ cardSize }, services.applyCardSize),
    setHdmiVisibility: hideDisconnectedHdmi => commit({ hideDisconnectedHdmi }, services.applyInputs),
    setTimeFormat: format => commit(format === 'none' ? { showTime: false } : { showTime: true, timeFormat: format }, services.applyClock),
    setLocation: weatherLocation => commit({ weatherLocation }, services.refreshWeather),
    setSpeed(direction) {
      const { MIN, MAX, STEP } = services.config.SPEED;
      const speed = Math.round(Math.max(MIN, Math.min(MAX, settings.getSnapshot().speed + direction * STEP)) * 100) / 100;
      commit({ speed }, () => services.applySpeed(speed));
    },
    saveInputName(port, value) {
      if ((settings.getSnapshot().inputNames[port] || '') === value) { return; }
      const inputNames = { ...settings.getSnapshot().inputNames };
      if (value) { inputNames[port] = value; } else { delete inputNames[port]; }
      commit({ inputNames }, services.applyInputs);
    },
    toggleApp(id) {
      const home = settings.getSnapshot().home;
      commit({ home: home.includes(id) ? home.filter(item => item !== id) : [...home, id] });
    },
    openStore: services.openStore,
    useSamsungHome: services.useSamsungHome,
    preview() {
      transaction(() => view.set({ ...view.getSnapshot(), previewing: true }));
    }
  };
};
