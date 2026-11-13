import type { Store } from "../shared/state/createStore";

export type LauncherUpdateCheck = "idle" | "checking" | "current" | "failed";

export interface LauncherUpdateSnapshot {
  // Result of the last check started from Settings. Background checks stay silent.
  readonly check: LauncherUpdateCheck;
  readonly installedVersion: string;
  readonly latestVersion: string | null;
  readonly releaseNotes: readonly string[];
  readonly unread: boolean;
}

export interface LauncherUpdateNotice extends Store<LauncherUpdateSnapshot> {
  acknowledge(): void;
  checkNow(): void;
}
