import type { RefObject } from "preact";

import type {
  AppPresentation,
  BackgroundOption,
  Clock,
  ContinueSource,
  InputOption,
  InstalledApp,
  LauncherConfig,
  SettingsBridge,
} from "../contracts/launcher";
import type {
  CardSize,
  DateFormat,
  SettingsSnapshot,
  SettingsStore,
  SettingsValues,
  TemperatureUnit,
  TimeFormat,
  WeatherLocation,
} from "../contracts/preferences";
import type { Navigation } from "../shared/navigation/createNavigation";
import type { MutableStore, Store } from "../shared/state/createStore";

import type { GlassState } from "./glass/categories";
export interface SettingsInventorySnapshot {
  readonly apps: readonly Readonly<InstalledApp>[];
  readonly continueMessage: string;
  readonly continueSources: readonly ContinueSource[];
  readonly inputs: readonly InputOption[];
}
export interface SettingsInventory extends Store<SettingsInventorySnapshot> {
  dispose(): void;
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
