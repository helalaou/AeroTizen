import type { DiagnosticData, DiagnosticsPrivacy, DiagnosticValue } from "../../contracts/diagnostics";

const MAX_METADATA_CHARACTERS = 16384;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BUILD_ID_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40,64}$/;
const SESSION_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_DELIVERY_RETRIES = 3;
const MIN_HTTP_STATUS = 100;
const MAX_HTTP_STATUS = 599;
const HEALTH_COUNTS = [
  "buffered",
  "discarded",
  "invalid",
  "pending_errors",
  "writes",
  "write_failures",
  "read_failures",
];
const HEALTH_FLAGS = ["unsaved", "saving"];
const STORAGE_STATES = ["unavailable", "loading", "ready", "saving", "failed"];
const CLOCK_TYPES = ["monotonic", "wall_fallback"];
const DELIVERY_STATES = ["idle", "acknowledged", "unavailable", "rejected"];

export const SERVICE_METADATA_PATH = "/etc/os-release";
export const SERVICE_METADATA_LIMIT_BYTES = 16384;
export type ReadServiceMetadata = (done: (error: unknown, text?: unknown) => void) => void;

interface DiagnosticsContextOptions {
  readonly arch: string | null;
  readonly build?: unknown;
  now?(): number;
  readonly privacy: DiagnosticsPrivacy;
  read: ReadServiceMetadata;
}

interface ServiceEnvironment {
  readonly arch: string | null;
  readonly firmware: DiagnosticValue;
  readonly reason?: "os_release_unavailable" | "os_release_fields_missing";
  readonly state: "loading" | "unavailable" | "collected" | "partial";
  readonly tizen: DiagnosticValue;
}

interface HomeControl {
  readonly mode?: string;
  readonly persistent?: boolean;
  readonly protocol?: number;
}

interface WatcherState {
  readonly guard: { readonly launchCalls?: number };
  readonly heartbeats?: number;
}

const fields = (value: unknown): Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};

const buildMetadata = (input: unknown) => {
  const value = fields(input);
  return {
    version: typeof value.version === "string" && VERSION_PATTERN.test(value.version) ? value.version : null,
    build_id: typeof value.build_id === "string" && BUILD_ID_PATTERN.test(value.build_id) ? value.build_id : null,
    commit: typeof value.commit === "string" && COMMIT_PATTERN.test(value.commit) ? value.commit : null,
    dirty: typeof value.dirty === "boolean" ? value.dirty : null,
  };
};

const healthMetadata = (input: unknown, privacy: DiagnosticsPrivacy): DiagnosticData => {
  const value = fields(input);
  const result: DiagnosticData = {};
  for (const key of HEALTH_COUNTS) {
    const count = value[key];
    if (typeof count === "number" && isFinite(count) && count >= 0) {
      result[key] = count;
    }
  }
  for (const key of HEALTH_FLAGS) {
    const flag = value[key];
    if (typeof flag === "boolean") {
      result[key] = flag;
    }
  }
  if (typeof value.storage === "string" && STORAGE_STATES.indexOf(value.storage) >= 0) {
    result.storage = value.storage;
  }
  if (typeof value.clock === "string" && CLOCK_TYPES.indexOf(value.clock) >= 0) {
    result.clock = value.clock;
  }
  if (typeof value.session === "string" && SESSION_PATTERN.test(value.session)) {
    result.session = privacy.value(value.session, "session");
  }
  return result;
};

const environmentMetadata = (text: unknown, privacy: DiagnosticsPrivacy) => {
  const result: { tizen: DiagnosticValue; firmware: DiagnosticValue } = { tizen: null, firmware: null };
  for (const line of String(text).slice(0, MAX_METADATA_CHARACTERS).split("\n")) {
    const match = line.match(/^(VERSION_ID|BUILD_ID)=(.*)$/);
    if (match) {
      const key = match[1] === "VERSION_ID" ? "tizen" : "firmware";
      result[key] = privacy.value(match[2].replace(/^['"]|['"]$/g, ""), key);
    }
  }
  return result;
};

export const createDiagnosticsContext = (options: DiagnosticsContextOptions) => {
  const { privacy } = options;
  const now = options.now ?? Date.now;
  let started = false;
  let environment: ServiceEnvironment = { state: "loading", tizen: null, firmware: null, arch: options.arch };
  let ui: ReturnType<typeof uiMetadata> | null = null;
  const uiMetadata = (input: unknown) => {
    const packet = fields(input);
    const delivery = fields(packet.delivery);
    return {
      reported_at: now(),
      health: healthMetadata(packet.health, privacy),
      build: buildMetadata(packet.build),
      delivery: {
        state:
          typeof delivery.state === "string" && DELIVERY_STATES.indexOf(delivery.state) >= 0 ? delivery.state : null,
        retries:
          typeof delivery.retries === "number" && delivery.retries >= 0 && delivery.retries <= MAX_DELIVERY_RETRIES
            ? delivery.retries
            : null,
        last_status:
          typeof delivery.last_status === "number" &&
          delivery.last_status >= MIN_HTTP_STATUS &&
          delivery.last_status <= MAX_HTTP_STATUS
            ? delivery.last_status
            : null,
      },
      version: typeof packet.version === "string" && VERSION_PATTERN.test(packet.version) ? packet.version : null,
      queued: typeof packet.queued === "number" && isFinite(packet.queued) && packet.queued >= 0 ? packet.queued : null,
    };
  };
  return {
    start: () => {
      if (started) {
        return;
      }
      started = true;
      options.read((error, text) => {
        if (error) {
          environment = { ...environment, state: "unavailable", reason: "os_release_unavailable" };
          return;
        }
        const metadata = environmentMetadata(text, privacy);
        const complete = !!(metadata.tizen && metadata.firmware);
        environment = {
          arch: options.arch,
          ...metadata,
          state: complete ? "collected" : "partial",
          ...(complete ? {} : { reason: "os_release_fields_missing" as const }),
        };
      });
    },
    accept: (packet: unknown) => {
      if (packet && !Array.isArray(packet)) {
        ui = uiMetadata(packet);
      }
    },
    enrich: <T extends object>(snapshot: T, control: HomeControl, state: WatcherState) => ({
      ...snapshot,
      build: buildMetadata(options.build),
      environment,
      ui,
      context: {
        mode: control.mode,
        persistent: control.persistent,
        protocol: control.protocol,
        watcher_heartbeats: state.heartbeats,
        watcher_launch_calls: state.guard.launchCalls,
        native_settings: "not_queried",
      },
    }),
  };
};
