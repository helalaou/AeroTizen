import type { DateFormat, SettingsValues, TemperatureUnit, TimeFormat } from "./preferences";

export interface InputSource {
  active?: boolean;
  connected?: boolean;
  editName?: string;
  number?: number;
  raw?: unknown;
  type: string;
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
  CARD_COLUMNS: Record<string, number>;
  DEFAULTS: Omit<SettingsValues, "home" | "tempUnit" | "timeFormat"> & {
    home: string[] | null;
    tempUnit: TemperatureUnit | null;
    timeFormat: TimeFormat | null;
  };
  FIREPLACE_ID: string;
  KEY: Record<"LEFT" | "RIGHT" | "UP" | "DOWN" | "ENTER" | "BACK" | "ESC" | "IME_DONE" | "IME_CANCEL", number>;
  LONG_PRESS_MS: number;
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
export interface ContinueItem {
  duration: number;
  episode: number;
  image?: string;
  key: string;
  playback: number;
  season: number;
  sourceIcon?: string;
  sourceId: string;
  sourceName: string;
  title: string;
}
export interface HomeBridge {
  blur(): void;
  buildRows(): void;
  focus(): void;
  keydown(code: number, event: Pick<KeyboardEvent, "preventDefault">): void;
  keyup(code: number): void;
  refreshApps(): void;
  render(): void;
}
