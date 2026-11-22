import type { Store } from "../shared/state/createStore";

import type { AppRecord } from "./apps";
import type { ContinueItem, ContinueSource } from "./launcher";

export interface ContinueFeedItem extends ContinueItem {
  readonly imdbId?: string;
  readonly mediaKind?: "movie" | "tv";
  readonly payload: string;
  readonly releaseYear?: number;
  readonly timestamp: number;
}

export interface ContinueWatchingSnapshot {
  readonly items: readonly ContinueFeedItem[];
  readonly messageKey: "" | "continue.findingApps" | "continue.noApps" | "continue.tvOnly";
  readonly sources: readonly ContinueSource[];
}

// Providers own discovery, transport and native launching; the service owns feed state.
export interface ContinueWatchingProvider {
  cancel(): void;
  check?(source: ContinueSource, done: (available: boolean) => void): void;
  discover(inventory: readonly AppRecord[]): readonly ContinueSource[];
  dispose?(): void;
  open(item: ContinueFeedItem): void;
  read(source: ContinueSource, done: (error: boolean, records?: unknown) => void): void;
}

export interface ContinueWatchingPlatform {
  isAvailable(): boolean;
  isHidden(): boolean;
  subscribeVisibility(listener: () => void): () => void;
}

export type ContinueBackdrop = { readonly status: "pending" } | { readonly status: "ready"; readonly url?: string };

export interface ContinueWatchingService extends Store<ContinueWatchingSnapshot> {
  dispose(): void;
  open(item: ContinueItem): void;
  refresh(choicesChanged?: boolean): void;
  start(): void;
  watchBackdrop?(item: ContinueItem, show: (result: ContinueBackdrop) => void): () => void;
}
