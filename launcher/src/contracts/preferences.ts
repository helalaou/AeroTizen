import type { Store } from "../shared/state/createStore";

export type TimeFormat = "12" | "24";
export type TemperatureUnit = "C" | "F";
export type DateFormat = "compact" | "short" | "long" | "numeric-short" | "numeric" | "iso" | "none";
export type Theme = "classic" | "glass";
export interface CustomGradient {
  readonly angle: number;
  readonly end: string;
  readonly start: string;
}
export interface WeatherLocation {
  readonly country_code?: string;
  readonly label?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
}
export interface SettingsValues {
  aeroClockStyle: "vertical" | "horizontal" | "minimal" | "bold";
  background: string;
  clockLayout: "classic" | "custom";
  continueWatching: boolean;
  continueWatchingApps: string[];
  customColour: string;
  customGradient: CustomGradient;
  dateFormat: DateFormat;
  hdmiKeepVisible: Record<string, boolean>;
  hdmiNativeViewer: boolean;
  hideDisconnectedHdmi: boolean;
  home: string[];
  homeAppLayout: "grid" | "scroll";
  homeCardColumns: number;
  inputNames: Record<string, string>;
  language: string;
  numerals: "latn" | "arab";
  performanceMode: boolean;
  showLiveTv: boolean;
  showNetwork: boolean;
  showTime: boolean;
  showWeather: boolean;
  speed: number;
  tempUnit: TemperatureUnit;
  theme: Theme;
  timeFormat: TimeFormat;
  weatherLocation: WeatherLocation | null;
  weatherPhoto: boolean;
  weatherShowLocation: boolean;
}
export type SettingsSnapshot = Readonly<
  Omit<SettingsValues, "home" | "inputNames" | "weatherLocation" | "continueWatchingApps" | "hdmiKeepVisible">
> & {
  readonly home: readonly string[];
  readonly homeInitialized: boolean;
  readonly continueWatchingApps: readonly string[];
  readonly hdmiKeepVisible: Readonly<Record<string, boolean>>;
  readonly inputNames: Readonly<Record<string, string>>;
  readonly weatherLocation: Readonly<WeatherLocation> | null;
};
export type SettingsPreferences = Omit<SettingsValues, "home"> & { home: string[] | null };
export type SettingsDefaults = Omit<SettingsPreferences, "tempUnit" | "timeFormat"> & {
  tempUnit: TemperatureUnit | null;
  timeFormat: TimeFormat | null;
};
export interface SettingsStore extends Store<SettingsSnapshot> {
  update(patch: Partial<SettingsPreferences>): void;
}
export interface SettingsService extends SettingsStore {
  dispose(): void;
  load(): void;
}
