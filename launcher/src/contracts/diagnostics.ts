export type DiagnosticValue = string | number | boolean | null;
export type DiagnosticData = Record<string, DiagnosticValue>;
export type DiagnosticSource = "ui" | "service";
export type DiagnosticTimer = number | { unref?(): void };

export interface DiagnosticRecord {
  at: number;
  data: DiagnosticData;
  elapsed_ms?: number;
  event: string;
  id: string;
  sequence?: number;
  session?: string;
  source: DiagnosticSource;
}

export interface DiagnosticHealth {
  buffered: number;
  clock: "wall_fallback" | "monotonic";
  discarded: number;
  invalid: number;
  pending_errors: number;
  read_failures: number;
  saving: boolean;
  session: string;
  storage: "unavailable" | "loading" | "ready" | "saving" | "failed";
  unsaved: boolean;
  write_failures: number;
  writes: number;
}

export interface DiagnosticSnapshot {
  health: DiagnosticHealth;
  records: DiagnosticRecord[];
  schema_version: 1;
}

export interface DiagnosticStorage {
  load(done: (error?: unknown, value?: string | null) => void): void;
  save(value: string, done: (error?: unknown) => void): void;
}

export interface Diagnostics {
  attach(storage: DiagnosticStorage | null, ready?: () => void): void;
  captureError(name: string, error: unknown, context?: unknown): void;
  flushStorage(): void;
  health(): DiagnosticHealth;
  ingest(incoming: unknown): boolean;
  record(name: string, data?: unknown): string | null;
  snapshot(): DiagnosticSnapshot;
}

export interface UiDiagnostics extends Diagnostics {
  flush(): void;
}

export interface DiagnosticsPrivacy {
  details(data: unknown): DiagnosticData;
  event(name: unknown): string;
  readonly session: string;
  value(input: unknown, key: string): DiagnosticValue;
}

export interface StartupLaunch {
  data?: Record<string, string>;
  error?: string;
  operation?: string;
}

export interface StartupTrace {
  last_launch?: StartupLaunch;
  launch?: StartupLaunch;
  marks: { name: string; ms: number; hidden: boolean; focused: boolean | null }[];
  navigation_at: number | null;
  script_at: number;
}

export interface LauncherStartup {
  afterLoad(callback: () => void): void;
  captureLaunch(): void;
  mark(name: string): void;
  readonly trace: StartupTrace;
}
