import type { RefObject } from "preact";

import type { AppPresentation, ContinueItem, HomeBridge, InputSource, InstalledApp } from "../contracts/launcher";
import type { SettingsSnapshot, SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";
import type { MutableStore, Store } from "../shared/state/createStore";
export interface Inventory {
  apps: readonly InstalledApp[];
  inputs: readonly InputSource[];
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
  inventory: Store<Inventory>;
  menuChoices(): readonly { action: string; label: string }[];
  nodes: Map<string, HTMLElement>;
  rows: RefObject<HTMLElement>;
  runtime: LauncherRuntime;
  select(key: string): void;
  settings: SettingsStore;
  showPage(page: Page): void;
  state: MutableStore<HomeState>;
  status: StatusStores;
  translate(value: string): string;
}
