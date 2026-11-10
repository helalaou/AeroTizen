import type { AppFailure } from "./apps";

export const HOME_WATCHER_PATHS = {
  apps: "/apps",
  home: "/home",
  leave: "/leave",
  startup: "/startup",
  status: "/",
  watch: "/watch",
} as const;

export type HomeWatcherReply = Readonly<Record<string, unknown>>;
export type HomeWatcherMessage = "handoff.homeTryAgain" | "handoff.wouldOpenHome";

export interface HomeWatcherPlatform {
  readonly available: boolean;
  flushDiagnostics(): void;
  isHidden(): boolean;
  loadServiceModule(ready: () => void, failed: () => void): () => void;
  notify(message: HomeWatcherMessage): void;
  openSamsungHome(failed: () => void): void;
  platformVersion(): number;
  record(event: string, data: Readonly<Record<string, unknown>>): void;
  request(path: string, timeoutMs: number, done: (value: HomeWatcherReply) => void, failed: () => void): () => void;
  startAppControl(accepted: () => void, failed: () => void): void;
  startWrtService(accepted: () => void, failed: () => void): void;
  subscribeVisibility(listener: () => void): () => void;
}

export interface HomeWatcherService {
  dispose(): void;
  isLeaving(): boolean;
  reportApps(ids: readonly string[]): void;
  reportStartup(trace: unknown): void;
  request(path: string, done?: (status: HomeWatcherReply) => void, failed?: AppFailure): void;
  start(done?: () => void, failed?: AppFailure): void;
  useSamsungHome(): void;
  watch(id: string, done?: () => void, failed?: AppFailure): void;
}
