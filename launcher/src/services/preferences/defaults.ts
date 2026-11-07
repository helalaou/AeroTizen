import { DEFAULT_CUSTOM_COLOUR } from "../../backgrounds/colours";
import { DEFAULT_CUSTOM_GRADIENT } from "../../backgrounds/gradients";
import type { SettingsDefaults } from "../../contracts/preferences";

export const DEFAULT_SETTINGS: SettingsDefaults = {
  home: null, // null selects first-launch defaults; [] retains an empty Home.
  glassSettings: false,
  homeCardColumns: 3,
  homeAppLayout: "grid",
  background: "aurora",
  customColour: DEFAULT_CUSTOM_COLOUR,
  customGradient: DEFAULT_CUSTOM_GRADIENT,
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
  hdmiNativeViewer: false,
  hdmiKeepVisible: {},
  inputNames: {},
};
