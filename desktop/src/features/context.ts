import type { RefObject } from "react";
import type { SavedTv } from "../contracts";

export type ProfileUpdate = SavedTv | ((current: SavedTv) => SavedTv);

export interface PendingOperation {
  message: string;
  scope: "app" | "discovery";
}
export interface FeatureContext {
  selected: SavedTv | null;
  mounted: RefObject<boolean>;
  run(
    message: string,
    action: () => Promise<void>,
    scope?: PendingOperation["scope"],
    reportError?: (message: string) => void,
  ): Promise<boolean>;
  loadPage<Result>(
    query: (signal: AbortSignal) => Promise<Result>,
    update: (result: Result | null) => void,
    showError: (error: string | null) => void,
    setLoading: (loading: boolean) => void,
    options?: { preserveResult?: boolean },
  ): void;
  cancelPageRead(): Promise<void> | undefined;
  updateProfile(id: string, profile: ProfileUpdate): void;
}
