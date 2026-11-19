import { DEFAULT_CUSTOM_COLOUR } from "../../backgrounds/colours";
import { DEFAULT_CUSTOM_GRADIENT } from "../../backgrounds/gradients";
import type { SettingsDefaults } from "../../contracts/preferences";
import { DEFAULT_HOME_LAYOUT } from "../../shared/homeLayout";

export const DEFAULT_SETTINGS: SettingsDefaults = {
  home: null, // null selects first-launch defaults; [] retains an empty Home.
  theme: "classic",
  performanceMode: false,
  homeCardColumns: 3,
  homeAppLayout: "grid",
  homeLayout: DEFAULT_HOME_LAYOUT,
  background: "aurora",
  customColour: DEFAULT_CUSTOM_COLOUR,
  customGradient: DEFAULT_CUSTOM_GRADIENT,
  weatherPhoto: false,
  speed: 1,
  showWeather: true,
  showTime: true,
  showDate: true,
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
  timeZone: "tv",
  continueWatching: false,
  continueWatchingApps: [],
  showContinueWatchingHeading: true,
  showInputsHeading: true,
  showLiveTv: true,
  hideDisconnectedHdmi: false,
  hdmiKeepVisible: {},
  inputNames: {},
};
