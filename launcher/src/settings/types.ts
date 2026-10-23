import type { ComponentChildren } from 'preact';

export type TimeFormat = '12' | '24';
export type TemperatureUnit = 'C' | 'F';
export type CardSize = 'big' | 'small';
export type DateFormat = 'compact' | 'short' | 'long' | 'numeric-short' | 'numeric' | 'iso' | 'none';

export interface WeatherLocation {
  name: string;
  label?: string;
  latitude: number;
  longitude: number;
  country_code?: string;
}

// Settings is opened after the legacy boot code resolves defaults and app inventory.
export interface SettingsValues {
  home: string[];
  cardSize: CardSize;
  background: string;
  speed: number;
  showWeather: boolean;
  showTime: boolean;
  showNetwork: boolean;
  tempUnit: TemperatureUnit;
  weatherLocation: WeatherLocation | null;
  weatherShowLocation: boolean;
  dateFormat: DateFormat | 'auto' | 'weekday' | 'dmy' | 'mdy';
  timeFormat: TimeFormat;
  showLiveTv: boolean;
  hideDisconnectedHdmi: boolean;
  inputNames: Record<string, string>;
}

export interface SearchState {
  query: string;
  results: WeatherLocation[];
  message: string;
}

export interface SettingsSnapshot {
  settings: Readonly<SettingsValues>;
  search: Readonly<SearchState>;
}

export interface InstalledApp {
  id: string;
  name: string;
  icon?: string;
  storeId?: string;
}

export interface InputSource {
  type: string;
  number?: number;
  editName?: string;
}

export interface Background {
  id: string;
  name: string;
  anim?: string;
}

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
}

export interface Tiles {
  ICONS: { flame: string; plus: string };
  app(app: InstalledApp): HTMLDivElement;
  card(name: string, icon: string): HTMLDivElement;
}

// This interface describes the existing JS modules used by Settings. It does not
// claim to type-check the legacy launcher or native Tizen API implementations.
export interface LauncherRuntime {
  config: LauncherConfig;
  settings: SettingsValues & { save(): void };
  clock: Clock;
  network: { updateVisibility(): void };
  inputs: { sources: InputSource[]; portName(source: InputSource): string; render(): void };
  homeScreen: { render(): void };
  apps: { all: InstalledApp[]; openStore(): void };
  homewatch: { useSamsungHome(): void };
  tiles: Tiles;
  settingsUi: SettingsController;
  $(id: string): HTMLElement;
  chunk<T>(items: T[], size: number): T[][];
  clearFocus(): void;
  toast(message: string): void;
  hideToast(): void;
  applyBackground(): void;
}

export interface SettingsActions {
  setBackground(background: string): void;
  setWeatherVisible(visible: boolean): void;
  setLocationVisible(visible: boolean): void;
  setTempUnit(unit: TemperatureUnit): void;
  setDateFormat(format: DateFormat): void;
  setNetworkVisible(visible: boolean): void;
  setLiveTvVisible(visible: boolean): void;
  setCardSize(size: CardSize): void;
  setHdmiVisibility(hide: boolean): void;
  setTimeFormat(format: TimeFormat | 'none'): void;
  setLocation(location: WeatherLocation | null): void;
  setQuery(query: string): void;
  search(): void;
  editInput(key: string, element: HTMLElement): void;
  saveInputName(port: string, value: string): void;
  toggleApp(id: string): void;
  openStore(): void;
  useSamsungHome(): void;
  preview(): void;
}

export interface Navigation {
  focus(): HTMLElement;
  invalidate(): void;
  select(key: string | undefined): void;
  reset(key: string): void;
  current(): HTMLElement | undefined;
  move(code: number): void;
}

export interface SettingsController {
  actions: SettingsActions;
  open(): void;
  close(): void;
  isOpen(): boolean;
  focus(): HTMLElement;
  keydown(code: number, event: Pick<KeyboardEvent, 'preventDefault'>): void;
  resize(): void;
}

export interface SettingsSectionProps {
  settings: Readonly<SettingsValues>;
  actions: SettingsActions;
}

export interface PillProps {
  id: string;
  selected?: boolean;
  onSelect(): void;
  children: ComponentChildren;
}

declare global {
  interface Window {
    AeroTizen: LauncherRuntime;
    Backgrounds: {
      list: Background[];
      preview(background: Background): string;
      setSpeed(speed: number): void;
    };
    Weather: {
      updateVisibility(): void;
      updateDisplay(): void;
      refresh(): void;
      searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): void;
    };
  }
}
