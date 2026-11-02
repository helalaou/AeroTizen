import type { RefObject } from "preact";

import type { Navigation } from "../shared/navigation/createNavigation";
import type { MutableStore, Store } from "../shared/state/createStore";

import type { GlassState } from "./glass/categories";

export type TimeFormat = "12" | "24";
export type TemperatureUnit = "C" | "F";
export type CardSize = "big" | "small";
export type DateFormat = "compact" | "short" | "long" | "numeric-short" | "numeric" | "iso" | "none";
export interface WeatherLocation {
  country_code?: string;
  label?: string;
  latitude: number;
  longitude: number;
  name: string;
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
  readonly continueWatchingApps: readonly string[];
  readonly hdmiKeepVisible: Readonly<Record<string, boolean>>;
  readonly inputNames: Readonly<Record<string, string>>;
  readonly weatherLocation: Readonly<WeatherLocation> | null;
};
export interface SettingsSource extends Partial<SettingsValues> {
  save(): void;
  subscribe(listener: () => void): () => void;
}
export interface SettingsStore extends Store<SettingsSnapshot> {
  dispose(): void;
  refresh(): void;
  update(patch: Partial<SettingsValues>): void;
}
export interface InstalledApp {
  icon?: string;
  id: string;
  name: string;
  storeId?: string;
}
export interface InputOption {
  readonly placeholder?: string;
  readonly port: string;
}
export interface ContinueSource {
  readonly icon?: string;
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly storeId: string;
}
export interface SettingsInventorySnapshot {
  readonly apps: readonly Readonly<InstalledApp>[];
  readonly continueMessage: string;
  readonly continueSources: readonly ContinueSource[];
  readonly inputs: readonly InputOption[];
}
export interface SettingsInventory extends Store<SettingsInventorySnapshot> {
  dispose(): void;
}
export interface Background {
  anim?: string;
  id: string;
  name: string;
}
export interface BackgroundOption extends Background {
  preview: string;
}
export interface Clock {
  DATE_FORMATS: ReadonlyArray<{ id: DateFormat; format(date: Date): string }>;
  dateStyle(format: SettingsValues["dateFormat"]): DateFormat;
  formatDate(date: Date, format: SettingsValues["dateFormat"]): string;
  formatTime(date: Date, format: TimeFormat): string;
  formatTimeParts?(date: Date, format: TimeFormat): { hour: string; minute: string; dayPeriod: string } | null;
  subscribe(listener: () => void): () => void;
  tick(): void;
}
export interface LauncherConfig {
  DEFAULTS: Omit<SettingsValues, "home" | "tempUnit" | "timeFormat"> & {
    home: string[] | null;
    tempUnit: TemperatureUnit | null;
    timeFormat: TimeFormat | null;
  };
  FIREPLACE_ID: string;
  KEY: Record<"LEFT" | "RIGHT" | "UP" | "DOWN" | "ENTER" | "BACK" | "ESC" | "IME_DONE" | "IME_CANCEL", number>;
  SPEED: { MIN: number; MAX: number; STEP: number };
}
export interface AppPresentation {
  artwork: readonly string[];
  background: string;
  label: string | null;
  largeLogo: boolean;
  logoColour: string;
  logoPath: string | null;
  textColour: string;
  title: string;
  useAppIcon: boolean;
}
export interface SettingsServices {
  applyBackground(): void;
  applyCardSize(): void;
  applyClock(): void;
  applyInputs(): void;
  applyLocationVisibility(): void;
  applyNetworkVisibility(): void;
  applySpeed(speed: number): void;
  applyWeatherVisibility(): void;
  backgrounds: readonly BackgroundOption[];
  clearHomeFocus(): void;
  clock: Omit<Clock, "tick">;
  config: LauncherConfig;
  describeApp(app: InstalledApp): AppPresentation;
  finishEditing(): void;
  hidePreviewMessage(): void;
  openStore(): void;
  refreshWeather(): void;
  searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): () => void;
  showPreviewMessage(): void;
  translate(value: string): string;
  useSamsungHome(): void;
}
export interface SettingsActions {
  openStore(): void;
  preview(): void;
  saveInputName(port: string, value: string): void;
  setBackground(background: string): void;
  setCardSize(size: CardSize): void;
  setClockLayout(layout: SettingsValues["clockLayout"]): void;
  setClockStyle(style: SettingsValues["aeroClockStyle"]): void;
  setContinueWatching(enabled: boolean): void;
  setDateFormat(format: DateFormat): void;
  setGlassSettings(enabled: boolean): void;
  setHdmiKeepVisible(port: string, keep: boolean): void;
  setHdmiVisibility(hide: boolean): void;
  setHomeCardColumns(columns: number | null): void;
  setHomeCardMode(mode: SettingsValues["homeCardMode"]): void;
  setLiveTvVisible(visible: boolean): void;
  setLocation(location: WeatherLocation | null): void;
  setLocationVisible(visible: boolean): void;
  setNetworkVisible(visible: boolean): void;
  setSpeed(direction: number): void;
  setTempUnit(unit: TemperatureUnit): void;
  setTimeFormat(format: TimeFormat | "none"): void;
  setWeatherPhoto(enabled: boolean): void;
  setWeatherVisible(visible: boolean): void;
  toggleApp(id: string): void;
  toggleContinueApp(id: string): void;
  useSamsungHome(): void;
}
// adjusting: OK was pressed on the speed slider, so Left/Right change the speed instead of moving focus.
export interface ViewState {
  adjusting: boolean;
  mounted: boolean;
  open: boolean;
  openedAt: number;
  previewing: boolean;
}
export interface NavigationHandlers {
  blur(): void;
  focus(): void;
  keydown(code: number, event: Pick<KeyboardEvent, "preventDefault">): void;
}
export interface SettingsBridge {
  close(): void;
  focus(): void;
  isOpen(): boolean;
  keydown(code: number, event: Pick<KeyboardEvent, "preventDefault">): void;
  open(): void;
  register(handlers: NavigationHandlers): () => void;
}
export interface SettingsEnvironment {
  actions: SettingsActions;
  bridge: SettingsBridge;
  glass: MutableStore<GlassState>;
  glassContent: RefObject<HTMLDivElement>;
  glassMenu: RefObject<HTMLDivElement>;
  glassScroll: RefObject<HTMLDivElement>;
  inventory: SettingsInventory;
  navigation: Navigation;
  root: RefObject<HTMLDivElement>;
  services: SettingsServices;
  settings: SettingsStore;
  view: MutableStore<ViewState>;
}
export interface SettingsSectionProps {
  actions: SettingsActions;
  settings: SettingsSnapshot;
}
