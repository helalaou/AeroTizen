import type { Store } from "../shared/state/createStore";

import type { AppRecord } from "./apps";
import type { ContinueItem, ContinueSource } from "./launcher";

export interface ContinueFeedItem extends ContinueItem {
  readonly payload: string;
  readonly timestamp: number;
}

export interface ContinueWatchingSnapshot {
  readonly items: readonly ContinueFeedItem[];
  readonly messageKey: "" | "continue.findingApps" | "continue.noApps" | "continue.tvOnly" | "continue.demoFeed";
  readonly sources: readonly ContinueSource[];
}

// The existing Samsung and Stremio adapters own discovery, transport and launching.
export interface ContinueWatchingProvider {
  cancel(): void;
  check?(source: ContinueSource, done: (available: boolean) => void): void;
  discover(inventory: readonly AppRecord[]): readonly ContinueSource[];
  open(item: ContinueFeedItem): void;
  read(source: ContinueSource, done: (error: boolean, records?: unknown) => void): void;
}

export interface ContinueWatchingPlatform {
  isAvailable(): boolean;
  isHidden(): boolean;
  subscribeVisibility(listener: () => void): () => void;
}

export interface ContinueWatchingService extends Store<ContinueWatchingSnapshot> {
  dispose(): void;
  open(item: ContinueItem): void;
  refresh(choicesChanged?: boolean): void;
  start(): void;
}
