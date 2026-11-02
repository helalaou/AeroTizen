import type { RefObject } from "preact";

import type { InputSource, LauncherRuntime } from "../settings/services/launcherRuntime";
import type { AppPresentation, InstalledApp, SettingsSnapshot, SettingsStore } from "../settings/types";
import type { MutableStore } from "../shared/state/createStore";

export interface Source extends InputSource {
  active?: boolean;
  connected?: boolean;
  raw?: unknown;
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
export interface HomeRuntime extends Omit<
  LauncherRuntime,
  "apps" | "inputs" | "continueWatching" | "homeScreen" | "config"
> {
  apps: LauncherRuntime["apps"] & {
    ready: boolean;
    byId(id: string): InstalledApp | null;
    launch(app: InstalledApp): void;
    playFireplace(): void;
  };
  config: LauncherRuntime["config"] & {
    CARD_COLUMNS: Record<string, number>;
    LONG_PRESS_MS: number;
  };
  continueWatching: NonNullable<LauncherRuntime["continueWatching"]> & {
    items: ContinueItem[];
    open(item: ContinueItem): void;
  };
  homeScreen: HomeBridge;
  i18n?: { t(value: string): string };
  inputs: Omit<LauncherRuntime["inputs"], "sources"> & {
    sources: Source[];
    label(source: Source): string;
    show(source: Source): void;
    isVisible?(source: Source): boolean;
    hasRecognizedDevice?(source: Source): boolean;
    alwaysVisible?(source: Source): boolean;
  };
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
export interface Inventory {
  apps: readonly InstalledApp[];
  inputs: readonly Source[];
  items: readonly ContinueItem[];
  ready: boolean;
}
export type Page = "home" | "apps";
export interface HomeState {
  active: boolean;
  draft: readonly string[] | null;
  menu: { id: string; selected: number } | null;
  moving: string | null;
  page: Page;
  selected: string;
}
export interface HomeEnvironment {
  activate(key: string): void;
  bridge: HomeBridge;
  choose(index: number): void;
  columns(settings: SettingsSnapshot): number;
  describe(app: InstalledApp): AppPresentation;
  dismiss(): void;
  inventory: MutableStore<Inventory>;
  menuChoices(): readonly { action: string; label: string }[];
  nodes: Map<string, HTMLElement>;
  rows: RefObject<HTMLElement>;
  runtime: HomeRuntime;
  select(key: string): void;
  settings: SettingsStore;
  showPage(page: Page): void;
  state: MutableStore<HomeState>;
  translate(value: string): string;
}
