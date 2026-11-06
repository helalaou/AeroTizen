import type { SettingsDefaults } from "../../contracts/preferences";

export const DEFAULT_SETTINGS: SettingsDefaults = {
  home: null, // null selects first-launch defaults; [] retains an empty Home.
  glassSettings: false,
  homeCardColumns: 3,
  homeAppLayout: "grid",
  background: "aurora",
  weatherPhoto: false,
  speed: 1,
  showWeather: true,
  showTime: true,
  showNetwork: true,
  tempUnit: null,
  weatherLocation: null,
  weatherShowLocation: true,
  dateFormat: "short",
  language: "auto",
  numerals: "latn",
  clockLayout: "classic",
  aeroClockStyle: "vertical",
  timeFormat: null,
  continueWatching: false,
  continueWatchingApps: [],
  showLiveTv: true,
  hideDisconnectedHdmi: false,
  hdmiKeepVisible: {},
  inputNames: {},
};
