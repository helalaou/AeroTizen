import type { Store } from "../shared/state/createStore";

export type NativeHomeTestAction = "get" | "set";
export interface NativeHomeValue {
  readonly errno?: number;
  readonly error?: string;
  readonly native_code?: number | null;
  readonly reason?: string;
  readonly status: string;
  readonly value?: number | string;
}
export interface NativeHomeReport {
  readonly can_set?: boolean;
  readonly execution?: {
    readonly error?: string | null;
    readonly method?: string | null;
    readonly signal?: string | null;
  };
  readonly query?: {
    readonly baseline_unchanged?: boolean | null;
    readonly error?: string;
    readonly main_operation?: NativeHomeValue;
    readonly settings?: Readonly<Record<string, NativeHomeValue>>;
    readonly steps?: readonly (NativeHomeValue & { readonly key: string })[];
    readonly success?: boolean;
  } | null;
  readonly set_test?: NativeHomeReport | null;
  readonly stage?: string;
  readonly status: string;
}
export interface NativeHomeTestSnapshot {
  readonly busy: NativeHomeTestAction | "refresh" | null;
  readonly message:
    | "changed"
    | "loading"
    | "ready"
    | "getPassed"
    | "getBlocked"
    | "setPassed"
    | "failed"
    | "interrupted"
    | "offline"
    | "tvRequired";
  readonly ready: boolean;
  readonly report: NativeHomeReport | null;
}
export interface NativeHomeTestPlatform {
  request(method: "GET" | "POST", action?: NativeHomeTestAction): Promise<NativeHomeReport>;
  startService(): Promise<void>;
}
export interface NativeHomeTestService extends Store<NativeHomeTestSnapshot> {
  dispose(): void;
  refresh(): Promise<void>;
  run(action: NativeHomeTestAction): Promise<void>;
}
