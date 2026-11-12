import type { Store } from "../shared/state/createStore";

import type { InstalledApp } from "./launcher";

export interface AppRecord {
  readonly iconPath?: string;
  readonly id: string;
  readonly name?: string;
  readonly packageId?: string;
  readonly show?: boolean;
}

export interface AppsSnapshot {
  readonly all: readonly InstalledApp[];
  readonly inventory: readonly AppRecord[];
  readonly ready: boolean;
  readonly realIds: readonly string[];
}

export interface AppsConfig {
  readonly DEFAULT_HOME_APPS: readonly string[];
  readonly FIREPLACE_ID: string;
  readonly FIREPLACE_VIDEO: string;
  readonly HBBTV_APP_ID: string;
  readonly HBBTV_LINK_METADATA: string;
  readonly HIDDEN_APPS: RegExp;
  readonly STORE_APP_IDS: readonly string[];
  readonly STORE_PACKAGE: RegExp;
}

export type AppFailure = (reason?: unknown, detail?: string, error?: unknown) => void;

export interface AppHandoff {
  prepareAppLaunch?(id: string, ready: () => void, failed: AppFailure): void;
  resume?(): void;
  suspendForExternal?(ready: () => void, failed: AppFailure): void;
  watch(id: string): void;
}

export interface AppsPlatform {
  readonly cacheInventory: boolean;
  dispose(): void;
  launch(app: InstalledApp, refresh: () => void): void;
  openStore(): void;
  playFireplace(apps: readonly InstalledApp[]): void;
  readInstalled(done: (records: unknown) => void): () => void;
}

export interface AppsService extends Store<AppsSnapshot> {
  byId(id: string): InstalledApp | null;
  defaultHome(): string[];
  dispose(): void;
  launch(app: InstalledApp): void;
  load(done?: (success: boolean) => void): void;
  openStore(): void;
  playFireplace(): void;
  restore(): void;
  subscribeDiscovery(listener: () => void): () => void;
}
