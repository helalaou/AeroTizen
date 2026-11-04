import type { RefObject } from "preact";

import type { BackgroundGraphics } from "../contracts/backgrounds";
import type {
  AppPresentation,
  BackgroundOption,
  ClockFormatter,
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
import type { LauncherUpdateNotice } from "../contracts/updates";
import type { MessageKey } from "../shared/i18n/catalogues";
import type { Navigation } from "../shared/navigation/createNavigation";
import type { MutableStore, Store } from "../shared/state/createStore";

import type { Category, SettingsDrawerState } from "./layout/categories";
export interface SettingsInventorySnapshot {
  readonly apps: readonly Readonly<InstalledApp>[];
  readonly continueMessage: MessageKey | "";
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
  backgroundWebGL: BackgroundGraphics;
  clearHomeFocus(): void;
  clock: ClockFormatter;
  config: LauncherConfig;
  describeApp(app: InstalledApp): AppPresentation;
  finishEditing(): void;
  hidePreviewMessage(): void;
  openStore(): void;
  refreshWeather(): void;
  searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): () => void;
  showPreviewMessage(): void;
  useSamsungHome(): void;
}
export interface SettingsActions {
  openStore(): void;
  preview(): void;
  saveInputName(port: string, value: string): void;
  setBackground(background: string): void;
  setCardSize(size: CardSize): void;
  setClockLayout(layout: "classic" | SettingsValues["aeroClockStyle"]): void;
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
  readonly adjusting: boolean;
  readonly mounted: boolean;
  readonly open: boolean;
  readonly openedAt: number;
  readonly previewing: boolean;
}
export interface SettingsEnvironment {
  actions: SettingsActions;
  bridge: SettingsBridge;
  categoryContent: RefObject<HTMLDivElement>;
  categoryMenu: RefObject<HTMLDivElement>;
  categoryScroll: RefObject<HTMLDivElement>;
  drawer: MutableStore<SettingsDrawerState>;
  inventory: SettingsInventory;
  navigation: Navigation;
  panes: Map<Category, HTMLElement>;
  root: RefObject<HTMLDivElement>;
  services: SettingsServices;
  settings: SettingsStore;
  updates: LauncherUpdateNotice;
  view: MutableStore<ViewState>;
}
export interface SettingsSectionProps {
  actions: SettingsActions;
  settings: SettingsSnapshot;
}
