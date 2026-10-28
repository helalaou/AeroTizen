import type { RefObject } from 'preact';
import type { MutableStore, Store } from '../shared/state/createStore';
import type { Navigation } from '../shared/navigation/createNavigation';

export type TimeFormat = '12' | '24';
export type TemperatureUnit = 'C' | 'F';
export type CardSize = 'big' | 'small';
export type DateFormat = 'compact' | 'short' | 'long' | 'numeric-short' | 'numeric' | 'iso' | 'none';
export interface WeatherLocation {
  name: string; label?: string; latitude: number; longitude: number; country_code?: string;
}
export interface SettingsValues {
  home: string[]; cardSize: CardSize; background: string; speed: number;
  weatherPhoto: boolean; showWeather: boolean; showTime: boolean; showNetwork: boolean; tempUnit: TemperatureUnit;
  weatherLocation: WeatherLocation | null; weatherShowLocation: boolean;
  dateFormat: DateFormat | 'auto' | 'weekday' | 'dmy' | 'mdy'; timeFormat: TimeFormat;
  continueWatching: boolean; continueWatchingApps: string[];
  showLiveTv: boolean; hideDisconnectedHdmi: boolean; inputNames: Record<string, string>;
}
export type SettingsSnapshot = Readonly<Omit<SettingsValues, 'home' | 'inputNames' | 'weatherLocation' | 'continueWatchingApps'>> & {
  readonly home: readonly string[];
  readonly continueWatchingApps: readonly string[];
  readonly inputNames: Readonly<Record<string, string>>;
  readonly weatherLocation: Readonly<WeatherLocation> | null;
};
export interface SettingsSource extends Partial<SettingsValues> {
  save(): void;
  subscribe(listener: () => void): () => void;
}
export interface SettingsStore extends Store<SettingsSnapshot> {
  update(patch: Partial<SettingsValues>): void;
  refresh(): void;
  dispose(): void;
}
export interface InstalledApp { id: string; name: string; icon?: string; storeId?: string }
export interface InputOption { readonly port: string; readonly placeholder?: string }
export interface ContinueSource { readonly icon?: string; readonly id: string; readonly name: string; readonly storeId: string; readonly status: string }
export interface SettingsInventorySnapshot {
  readonly apps: readonly Readonly<InstalledApp>[];
  readonly continueSources: readonly ContinueSource[];
  readonly continueMessage: string;
  readonly inputs: readonly InputOption[];
}
export interface SettingsInventory extends Store<SettingsInventorySnapshot> { dispose(): void }
export interface Background { id: string; name: string; anim?: string }
export interface BackgroundOption extends Background { preview: string }
export interface Clock {
  tick(): void;
  dateStyle(format: SettingsValues['dateFormat']): DateFormat;
  formatTime(date: Date, format: TimeFormat): string;
  DATE_FORMATS: ReadonlyArray<{ id: DateFormat; format(date: Date): string }>;
}
export interface LauncherConfig {
  KEY: Record<'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'ENTER' | 'BACK' | 'ESC' | 'IME_DONE' | 'IME_CANCEL', number>;
  SPEED: { MIN: number; MAX: number; STEP: number };
  FIREPLACE_ID: string;
  DEFAULTS: Omit<SettingsValues, 'home' | 'tempUnit' | 'timeFormat'> & {
    home: string[] | null; tempUnit: TemperatureUnit | null; timeFormat: TimeFormat | null;
  };
}
export interface AppPresentation {
  title: string; background: string; label: string | null; textColour: string;
  logoPath: string | null; logoColour: string; largeLogo: boolean; useAppIcon: boolean;
  artwork: readonly string[];
}
export interface SettingsServices {
  config: LauncherConfig;
  clock: Omit<Clock, 'tick'>;
  backgrounds: readonly BackgroundOption[];
  describeApp(app: InstalledApp): AppPresentation;
  searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): () => void;
  applyBackground(): void; applySpeed(speed: number): void; applyClock(): void;
  applyWeatherVisibility(): void; applyLocationVisibility(): void; refreshWeather(): void;
  applyNetworkVisibility(): void; applyInputs(): void; applyCardSize(): void;
  openStore(): void; useSamsungHome(): void; finishEditing(): void; clearHomeFocus(): void;
  showPreviewMessage(): void; hidePreviewMessage(): void;
}
export interface SettingsActions {
  setWeatherPhoto(enabled: boolean): void;
  setContinueWatching(enabled: boolean): void; toggleContinueApp(id: string): void;
  setBackground(background: string): void; setWeatherVisible(visible: boolean): void;
  setLocationVisible(visible: boolean): void; setTempUnit(unit: TemperatureUnit): void;
  setDateFormat(format: DateFormat): void; setNetworkVisible(visible: boolean): void;
  setLiveTvVisible(visible: boolean): void; setCardSize(size: CardSize): void;
  setHdmiVisibility(hide: boolean): void; setTimeFormat(format: TimeFormat | 'none'): void;
  setLocation(location: WeatherLocation | null): void; setSpeed(direction: number): void;
  saveInputName(port: string, value: string): void; toggleApp(id: string): void;
  openStore(): void; useSamsungHome(): void; preview(): void;
}
// adjusting: OK was pressed on the speed slider, so Left/Right change the speed instead of moving focus.
export interface ViewState { open: boolean; previewing: boolean; mounted: boolean; openedAt: number; adjusting: boolean }
export interface NavigationHandlers {
  focus(): void; blur(): void; keydown(code: number, event: Pick<KeyboardEvent, 'preventDefault'>): void;
}
export interface SettingsBridge {
  open(): void; close(): void; isOpen(): boolean; focus(): void;
  keydown(code: number, event: Pick<KeyboardEvent, 'preventDefault'>): void;
  register(handlers: NavigationHandlers): () => void;
}
export interface SettingsEnvironment {
  settings: SettingsStore; inventory: SettingsInventory; view: MutableStore<ViewState>; services: SettingsServices;
  actions: SettingsActions; bridge: SettingsBridge; navigation: Navigation;
  root: RefObject<HTMLDivElement>;
}
export interface SettingsSectionProps { settings: SettingsSnapshot; actions: SettingsActions }
