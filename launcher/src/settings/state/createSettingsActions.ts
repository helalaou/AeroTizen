import { colourToChannels, normalizeColour } from "../../backgrounds/colours";
import { normalizeGradient } from "../../backgrounds/gradients";
import type { SettingsStore, SettingsValues } from "../../contracts/preferences";
import type { MutableStore } from "../../shared/state/createStore";
import type { SettingsActions, SettingsServices, ViewState } from "../types";

import { adjustDraftColour, draftBackground } from "./colourPicker";

export const createSettingsActions = (
  settings: SettingsStore,
  services: SettingsServices,
  view: MutableStore<ViewState>,
  transaction: (action: () => void) => void,
): SettingsActions => {
  const commit = (patch: Partial<SettingsValues>, after?: () => void) =>
    transaction(() => {
      settings.update(patch);
      after?.();
    });
  return {
    openColourPicker() {
      const hex = normalizeColour(settings.getSnapshot().customColour);
      transaction(() =>
        view.set({
          ...view.getSnapshot(),
          adjusting: false,
          colourPicker: { kind: "solid", colour: colourToChannels(hex) },
        }),
      );
    },
    openGradientPicker() {
      const gradient = normalizeGradient(settings.getSnapshot().customGradient);
      transaction(() =>
        view.set({
          ...view.getSnapshot(),
          adjusting: false,
          colourPicker: {
            kind: "gradient",
            colours: [colourToChannels(gradient.start), colourToChannels(gradient.end)],
            activeStop: 0,
            angle: gradient.angle,
          },
        }),
      );
    },
    setGradientStop(stop) {
      const current = view.getSnapshot();
      const draft = current.colourPicker;
      if (draft?.kind === "gradient") {
        transaction(() => view.set({ ...current, colourPicker: { ...draft, activeStop: stop } }));
      }
    },
    adjustGradientAngle(direction) {
      const current = view.getSnapshot();
      const draft = current.colourPicker;
      if (draft?.kind === "gradient") {
        const angle = (((draft.angle + direction) % 360) + 360) % 360;
        transaction(() => view.set({ ...current, colourPicker: { ...draft, angle } }));
      }
    },
    adjustColour(channel, direction) {
      const current = view.getSnapshot();
      const colour = current.colourPicker;
      if (colour) {
        transaction(() => view.set({ ...current, colourPicker: adjustDraftColour(colour, channel, direction) }));
      }
    },
    closeColourPicker(apply) {
      const colour = view.getSnapshot().colourPicker;
      if (!colour) {
        return;
      }
      transaction(() => {
        if (apply) {
          const preview = draftBackground(colour);
          const patch: Partial<SettingsValues> =
            preview.kind === "solid"
              ? { background: "custom", customColour: preview.colour, weatherPhoto: false }
              : { background: "custom-gradient", customGradient: preview.gradient, weatherPhoto: false };
          commit(patch, () => {
            services.applyBackground();
          });
        }
        view.set({ ...view.getSnapshot(), colourPicker: null });
      });
    },
    setTheme: (theme) => commit({ theme }),
    setPerformanceMode: (performanceMode) => commit({ performanceMode }, services.applyBackground),
    setWeatherPhoto: (weatherPhoto) => commit({ weatherPhoto }, services.applyBackground),
    setContinueWatching: (continueWatching) => commit({ continueWatching }),
    toggleContinueApp(id) {
      const selected = settings.getSnapshot().continueWatchingApps;
      commit({
        continueWatchingApps: selected.includes(id) ? selected.filter((app) => app !== id) : [...selected, id],
      });
    },
    setBackground: (background) => commit({ background, weatherPhoto: false }, services.applyBackground),
    setWeatherVisible: (showWeather) => commit({ showWeather }),
    setLocationVisible: (weatherShowLocation) => commit({ weatherShowLocation }),
    setTempUnit: (tempUnit) => commit({ tempUnit }),
    setClockLayout: (layout) =>
      commit(
        layout === "classic" ? { clockLayout: "classic" } : { clockLayout: "custom", aeroClockStyle: layout },
        services.applyClock,
      ),
    setDateFormat: (dateFormat) => commit({ dateFormat }, services.applyClock),
    setNumerals: (numerals) => commit({ numerals }, services.applyClock),
    setNetworkVisible: (showNetwork) => commit({ showNetwork }),
    setLiveTvVisible: (showLiveTv) => commit({ showLiveTv }),
    setHomeCardColumns: (homeCardColumns) => commit({ homeCardColumns }, services.applyCardSize),
    setHomeAppLayout: (homeAppLayout) => commit({ homeAppLayout }, services.applyCardSize),
    setHdmiVisibility: (hideDisconnectedHdmi) => commit({ hideDisconnectedHdmi }),
    setHdmiNativeViewer: (hdmiNativeViewer) => commit({ hdmiNativeViewer }),
    setHdmiKeepVisible: (port, keep) =>
      commit({ hdmiKeepVisible: { ...settings.getSnapshot().hdmiKeepVisible, [port]: keep } }),
    setTimeFormat: (format) =>
      commit(format === "none" ? { showTime: false } : { showTime: true, timeFormat: format }, services.applyClock),
    setTimeZone: (timeZone) => commit({ timeZone }, services.applyClock),
    setLocation: (weatherLocation) => commit({ weatherLocation }),
    setSpeed(direction) {
      const { MIN, MAX, STEP } = services.config.SPEED;
      const speed =
        Math.round(Math.max(MIN, Math.min(MAX, settings.getSnapshot().speed + direction * STEP)) * 100) / 100;
      commit({ speed }, () => services.applySpeed(speed));
    },
    saveInputName(port, value) {
      if ((settings.getSnapshot().inputNames[port] || "") === value) {
        return;
      }
      const { [port]: previousName, ...otherNames } = settings.getSnapshot().inputNames;
      const inputNames = value ? { ...otherNames, [port]: value } : otherNames;
      commit({ inputNames });
    },
    toggleApp(id) {
      const home = settings.getSnapshot().home;
      commit({ home: home.includes(id) ? home.filter((item) => item !== id) : [...home, id] });
    },
    openStore: services.openStore,
    useSamsungHome: services.useSamsungHome,
    preview() {
      transaction(() => view.set({ ...view.getSnapshot(), previewing: true }));
    },
  };
};
