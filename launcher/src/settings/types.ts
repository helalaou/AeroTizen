import type { RefObject } from "preact";

import type { BackgroundGraphics, BackgroundPreview } from "../contracts/backgrounds";
import type { LearnIpControlResult } from "../contracts/ipControl";
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
  DateFormat,
  SettingsSnapshot,
  SettingsStore,
  SettingsValues,
  TemperatureUnit,
  Theme,
  TimeFormat,
  TimeZoneSource,
  WeatherLocation,
} from "../contracts/preferences";
import type { WeatherSnapshot } from "../contracts/status";
import type { LauncherUpdateNotice } from "../contracts/updates";
import type { MessageKey } from "../shared/i18n/catalogues";
import type { Navigation } from "../shared/navigation/createNavigation";
import type { MutableStore, Store } from "../shared/state/createStore";

import type { Category, SettingsDrawerState } from "./layout/categories";
import type { ColourChannel, ColourPickerDraft } from "./state/colourPicker";
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
  applySpeed(speed: number): void;
  backgrounds: readonly BackgroundOption[];
  backgroundWebGL: BackgroundGraphics;
  canLearnIpControlInput(): boolean;
  clearHomeFocus(): void;
  clock: ClockFormatter;
  config: LauncherConfig;
  describeApp(app: InstalledApp): AppPresentation;
  finishEditing(): void;
  learnIpControlInput(): Promise<LearnIpControlResult>;
  openStore(): void;
  previewBackground(preview: BackgroundPreview | null): void;
  searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): () => void;
  useSamsungHome(): void;
  weather: Store<WeatherSnapshot>;
}
export interface SettingsActions {
  adjustColour(channel: ColourChannel, direction: number): void;
  adjustGradientAngle(direction: number): void;
  closeColourPicker(apply: boolean): void;
  openColourPicker(): void;
  openGradientPicker(): void;
  openStore(): void;
  saveInputName(port: string, value: string): void;
  setBackground(background: string): void;
  setClockLayout(layout: "classic" | SettingsValues["aeroClockStyle"]): void;
  setContinueWatching(enabled: boolean): void;
  setDateFormat(format: DateFormat): void;
  setGradientStop(stop: 0 | 1): void;
  setHdmiKeepVisible(port: string, keep: boolean): void;
  setHdmiNativeViewer(enabled: boolean): void;
  setHdmiVisibility(hide: boolean): void;
  setHomeAppLayout(layout: SettingsValues["homeAppLayout"]): void;
  setHomeCardColumns(columns: number): void;
  setLiveTvVisible(visible: boolean): void;
  setLocation(location: WeatherLocation | null): void;
  setLocationVisible(visible: boolean): void;
  setNetworkVisible(visible: boolean): void;
  setNumerals(numerals: "latn" | "arab"): void;
  setPerformanceMode(enabled: boolean): void;
  setSpeed(direction: number): void;
  setTempUnit(unit: TemperatureUnit): void;
  setTheme(theme: Theme): void;
  setTimeFormat(format: TimeFormat | "none"): void;
  setTimeZone(source: TimeZoneSource): void;
  setWeatherPhoto(enabled: boolean): void;
  setWeatherVisible(visible: boolean): void;
  toggleApp(id: string): void;
  toggleContinueApp(id: string): void;
  useSamsungHome(): void;
}
export interface ViewState {
  readonly colourPicker: ColourPickerDraft | null;
  readonly mounted: boolean;
  readonly open: boolean;
  readonly openedAt: number;
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
