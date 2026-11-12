import type { AppFailure, AppHandoff } from "./apps";

export interface NativeWatcher {
  request?(path: string, done?: (status: unknown) => void, failed?: AppFailure): void;
  watch(id: string, ready?: () => void, failed?: AppFailure): void;
}

export interface NativeHdmiHandoff {
  fallback(): void;
  readonly label: string;
  selectSource?(): Promise<boolean>;
}

export interface NativeNavigationCommands extends Required<
  Pick<AppHandoff, "prepareAppLaunch" | "resume" | "suspendForExternal">
> {
  openNativeViewer(source?: unknown, hdmi?: NativeHdmiHandoff | null): boolean;
  openSamsungHome(): void;
}

export interface NativeNavigation {
  readonly commands: NativeNavigationCommands;
  dispose(): void;
  start(): void;
}
