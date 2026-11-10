import type { MessageKey } from "../shared/i18n/catalogues";
import type { Store } from "../shared/state/createStore";

import type { AppsConfig } from "./apps";
import type { DateFormat, SettingsDefaults, SettingsValues, TimeFormat } from "./preferences";

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
type BackgroundId = Extract<MessageKey, `scene.${string}`> extends `scene.${infer Id}` ? Id : never;

export interface Background {
  readonly anim?: string;
  readonly category?: "solid" | "gradient";
  readonly id: BackgroundId;
}
export interface BackgroundOption extends Background {
  readonly preview: string;
  readonly requiresWebGL: boolean;
}
export interface ClockPlatform {
  dateTimeFormat(locales: string[], options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat;
  getDatePattern(): string;
  getLocales(): string[];
  getTimePattern(): string;
}
export interface ClockService extends Store<number> {
  DATE_FORMATS: ReadonlyArray<{ id: DateFormat; format(date: Date): string }>;
  dateStyle(format: SettingsValues["dateFormat"]): DateFormat;
  defaultTimeFormat(): TimeFormat;
  formatDate(date: Date, format: SettingsValues["dateFormat"]): string;
  formatTime(date: Date, format: TimeFormat): string;
  formatTimeParts?(date: Date, format: TimeFormat): { hour: string; minute: string; dayPeriod: string } | null;
  measureTime(format: TimeFormat, font: string, measureText: (value: string) => number): number;
  measureTimeDeferred?(
    format: TimeFormat,
    font: string,
    measureText: (value: string) => number,
    onWidth: (width: number) => void,
  ): () => void;
  start(): void;
  tick(): void;
}
export type ClockFormatter = Pick<
  ClockService,
  "dateStyle" | "formatDate" | "formatTime" | "subscribe" | "DATE_FORMATS"
>;
export interface LauncherConfig extends AppsConfig {
  DEFAULTS?: Partial<SettingsDefaults>;
  FIREPLACE_ID: string;
  KEY: Record<"LEFT" | "RIGHT" | "UP" | "DOWN" | "ENTER" | "BACK" | "ESC" | "IME_DONE" | "IME_CANCEL", number>;
  LEGACY_STORAGE_KEYS: string[];
  LONG_PRESS_MS: number;
  SPEED: { MIN: number; MAX: number; STEP: number };
  STORAGE_KEY: string;
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
  readonly backgroundImage?: string;
  readonly duration: number;
  readonly episode: number;
  readonly image?: string;
  readonly key: string;
  readonly playback: number;
  readonly season: number;
  readonly sourceIcon?: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly thumbnailImage?: string;
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
