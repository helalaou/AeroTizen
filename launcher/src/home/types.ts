import type { RefObject } from "preact";

import type { AppPresentation, ContinueItem, HomeBridge, InputSource, InstalledApp } from "../contracts/launcher";
import type { SettingsSnapshot, SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";
import type { MutableStore, Store } from "../shared/state/createStore";
export interface Inventory {
  readonly apps: readonly InstalledApp[];
  readonly inputs: readonly InputSource[];
  readonly items: readonly ContinueItem[];
  readonly ready: boolean;
}
export type Page = "home" | "apps";
export interface HomeMenuChoice {
  readonly action: "add" | "remove" | "move";
  readonly label: string;
}
export interface HomeState {
  readonly active: boolean;
  readonly continueOffset: number;
  readonly draft: readonly string[] | null;
  readonly menu: Readonly<{ id: string; selected: number }> | null;
  readonly moving: string | null;
  readonly page: Page;
  readonly scroll: number;
  readonly selected: string;
}
export interface HomeEnvironment {
  activate(key: string): void;
  bridge: HomeBridge;
  choose(index: number): void;
  columns(settings: SettingsSnapshot): number;
  continueItems: RefObject<HTMLDivElement>;
  continueViewport: RefObject<HTMLDivElement>;
  describe(app: InstalledApp): AppPresentation;
  dismiss(): void;
  inventory: Store<Inventory>;
  menuChoices(): readonly HomeMenuChoice[];
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
