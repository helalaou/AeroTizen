import type { Store } from "../shared/state/createStore";

import type { DateFormat, SettingsValues, TemperatureUnit, TimeFormat } from "./preferences";

export interface InputSource {
  readonly active?: boolean;
  readonly connected?: boolean;
  readonly editName?: string;
  readonly number?: number;
  readonly raw?: unknown;
  readonly type: string;
}

export interface InstalledApp {
  readonly icon?: string;
  readonly id: string;
  readonly name: string;
  readonly storeId?: string;
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
  readonly anim?: string;
  readonly id: string;
  readonly name: string;
}
export interface BackgroundOption extends Background {
  readonly preview: string;
  readonly requiresWebGL: boolean;
}
export interface ClockService extends Store<number> {
  DATE_FORMATS: ReadonlyArray<{ id: DateFormat; format(date: Date): string }>;
  dateStyle(format: SettingsValues["dateFormat"]): DateFormat;
  formatDate(date: Date, format: SettingsValues["dateFormat"]): string;
  formatTime(date: Date, format: TimeFormat): string;
  formatTimeParts?(date: Date, format: TimeFormat): { hour: string; minute: string; dayPeriod: string } | null;
  measureTime(format: TimeFormat, font: string, measureText: (value: string) => number): number;
  subscribe(listener: () => void): () => void;
  tick(): void;
}
export type ClockFormatter = Pick<
  ClockService,
  "dateStyle" | "formatDate" | "formatTime" | "subscribe" | "DATE_FORMATS"
>;
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
  readonly artwork: readonly string[];
  readonly background: string;
  readonly label: string | null;
  readonly largeLogo: boolean;
  readonly logoColour: string;
  readonly logoPath: string | null;
  readonly textColour: string;
  readonly title: string;
  readonly useAppIcon: boolean;
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
  readonly duration: number;
  readonly episode: number;
  readonly image?: string;
  readonly key: string;
  readonly playback: number;
  readonly season: number;
  readonly sourceIcon?: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly title: string;
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
