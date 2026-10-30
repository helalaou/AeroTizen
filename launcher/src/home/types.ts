import type { RefObject } from 'preact';
import type { MutableStore } from '../shared/state/createStore';
import type { InstalledApp, AppPresentation, SettingsSnapshot, SettingsStore } from '../settings/types';
import type { LauncherRuntime, InputSource } from '../settings/services/launcherRuntime';

export interface Source extends InputSource { connected?: boolean; active?: boolean; raw?: unknown }
export interface ContinueItem {
  key: string; title: string; sourceName: string; sourceId: string; sourceIcon?: string;
  season: number; episode: number; image?: string; duration: number; playback: number;
}
export interface HomeRuntime extends Omit<LauncherRuntime, 'apps' | 'inputs' | 'continueWatching' | 'homeScreen' | 'config'> {
  config: LauncherRuntime['config'] & { CARD_COLUMNS: Record<string, number>; LONG_PRESS_MS: number };
  apps: LauncherRuntime['apps'] & { ready: boolean; byId(id: string): InstalledApp | null; launch(app: InstalledApp): void; playFireplace(): void };
  inputs: Omit<LauncherRuntime['inputs'], 'sources'> & { sources: Source[]; label(source: Source): string; show(source: Source): void; isVisible?(source: Source): boolean; hasRecognizedDevice?(source: Source): boolean; alwaysVisible?(source: Source): boolean };
  continueWatching: NonNullable<LauncherRuntime['continueWatching']> & { items: ContinueItem[]; open(item: ContinueItem): void };
  homeScreen: HomeBridge;
  i18n?: { t(value: string): string };
}
export interface HomeBridge { render(): void; buildRows(): void; refreshApps(): void; focus(): void; blur(): void; keydown(code: number, event: Pick<KeyboardEvent, 'preventDefault'>): void; keyup(code: number): void }
export interface Inventory { apps: readonly InstalledApp[]; inputs: readonly Source[]; items: readonly ContinueItem[]; ready: boolean }
export type Page = 'home' | 'apps';
export interface HomeState { page: Page; selected: string; active: boolean; moving: string | null; draft: readonly string[] | null; menu: { id: string; selected: number } | null }
export interface HomeEnvironment {
  runtime: HomeRuntime; settings: SettingsStore; inventory: MutableStore<Inventory>; state: MutableStore<HomeState>;
  nodes: Map<string, HTMLElement>; rows: RefObject<HTMLElement>; bridge: HomeBridge;
  describe(app: InstalledApp): AppPresentation; translate(value: string): string;
  select(key: string): void; activate(key: string): void; showPage(page: Page): void; choose(index: number): void; dismiss(): void;
  menuChoices(): readonly { action: string; label: string }[];
  columns(settings: SettingsSnapshot): number;
}
