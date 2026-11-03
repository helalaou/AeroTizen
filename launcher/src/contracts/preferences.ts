import type { Store } from "../shared/state/createStore";

export type TimeFormat = "12" | "24";
export type TemperatureUnit = "C" | "F";
export type CardSize = "big" | "small";
export type DateFormat = "compact" | "short" | "long" | "numeric-short" | "numeric" | "iso" | "none";
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
  cardSize: CardSize;
  clockLayout: "classic" | "custom";
  continueWatching: boolean;
  continueWatchingApps: string[];
  dateFormat: DateFormat | "auto" | "weekday" | "dmy" | "mdy";
  glassSettings: boolean;
  hdmiKeepVisible: Record<string, boolean>;
  hideDisconnectedHdmi: boolean;
  home: string[];
  homeCardColumns: number | null;
  homeCardMode: "square" | "rectangle";
  inputNames: Record<string, string>;
  showLiveTv: boolean;
  showNetwork: boolean;
  showTime: boolean;
  showWeather: boolean;
  speed: number;
  tempUnit: TemperatureUnit;
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
export interface SettingsSource extends Partial<Omit<SettingsValues, "home" | "tempUnit" | "timeFormat">> {
  home?: string[] | null;
  save(): void;
  subscribe(listener: () => void): () => void;
  tempUnit?: TemperatureUnit | null;
  timeFormat?: TimeFormat | null;
}
export interface SettingsStore extends Store<SettingsSnapshot> {
  dispose(): void;
  refresh(): void;
  update(patch: Partial<SettingsValues>): void;
}
