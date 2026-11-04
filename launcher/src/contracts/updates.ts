import type { Store } from "../shared/state/createStore";

export interface LauncherUpdateSnapshot {
  readonly installedVersion: string;
  readonly latestVersion: string | null;
  readonly releaseNotes: readonly string[];
  readonly unread: boolean;
}

export interface LauncherUpdateNotice extends Store<LauncherUpdateSnapshot> {
  acknowledge(): void;
}
