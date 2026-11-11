import type {
  DiagnosticHealth,
  DiagnosticRecord,
  Diagnostics,
  DiagnosticSnapshot,
  DiagnosticSource,
  DiagnosticStorage,
  DiagnosticTimer,
} from "../contracts/diagnostics";

import { createDiagnosticsPrivacy } from "./createDiagnosticsPrivacy";

declare const process: { hrtime?: () => [number, number] } | undefined;

export const DIAGNOSTIC_RECORD_LIMIT = 200;
const MAX_CHARACTERS = 60000;
const SAVE_DELAY_MS = 500;
const MAX_PENDING_ERRORS = 16;
const MILLISECONDS_PER_SECOND = 1000;
const NANOSECONDS_PER_MILLISECOND = 1000000;

interface DiagnosticOptions {
  later?(callback: () => void, delayMs: number): DiagnosticTimer;
  now?(): number;
}

const monotonicClock = () => {
  if (typeof performance !== "undefined" && performance.now) {
    return () => performance.now();
  }
  if (typeof process !== "undefined" && process.hrtime) {
    const hrtime = process.hrtime;
    return () => {
      const time = hrtime();
      return time[0] * MILLISECONDS_PER_SECOND + time[1] / NANOSECONDS_PER_MILLISECOND;
    };
  }
  return Date.now;
};
const recordObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

export const createDiagnostics = (source: DiagnosticSource, options: DiagnosticOptions = {}): Diagnostics => {
  const privacy = createDiagnosticsPrivacy();
  const later = options.later ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const mono = options.now ?? monotonicClock();
  const origin = mono();
  const session = privacy.session;
  let records: DiagnosticRecord[] = [];
  let total = 0;
  let store: DiagnosticStorage | null = null;
  let serial = 0;
  let discarded = 0;
  let invalid = 0;
  let writeFailures = 0;
  let readFailures = 0;
  let writes = 0;
  let storageState: DiagnosticHealth["storage"] = "unavailable";
  let pendingErrors = 0;
  let elapsed = 0;
  let revision = 0;
  let saved = 0;
  let loading = false;
  let saving = false;
  let saveTimer: DiagnosticTimer | null = null;

  const scheduleSave = (delayMs = SAVE_DELAY_MS) => {
    if (!store || loading || saving || saveTimer !== null || revision === saved) {
      return;
    }
    saveTimer = later(persist, delayMs);
    // Optional logs must not hold the background service open during shutdown.
    if (typeof saveTimer === "object") {
      saveTimer.unref?.();
    }
  };
  function persist() {
    saveTimer = null;
    if (!store || loading || saving || revision === saved) {
      return;
    }
    const target = store;
    const writing = revision;
    let complete = false;
    saving = true;
    storageState = "saving";
    const done = (error?: unknown) => {
      if (complete) {
        return;
      }
      complete = true;
      saving = false;
      if (error) {
        store = null;
        storageState = "failed";
        writeFailures += 1;
        return;
      }
      storageState = "ready";
      writes += 1;
      saved = writing;
      scheduleSave();
    };
    try {
      target.save(JSON.stringify(records), done);
    } catch (error) {
      done(error);
    }
  }
  const ingest = (incoming: unknown) => {
    if (!Array.isArray(incoming) || incoming.length > DIAGNOSTIC_RECORD_LIMIT) {
      return false;
    }
    let changed = false;
    for (const input of incoming as unknown[]) {
      const item = recordObject(input);
      if (
        !item ||
        (item.source !== "ui" && item.source !== "service") ||
        typeof item.id !== "string" ||
        !/^[a-z0-9-]{1,64}$/.test(item.id) ||
        typeof item.at !== "number" ||
        !isFinite(item.at) ||
        typeof item.event !== "string" ||
        !/^[a-zA-Z0-9_.-]{1,64}$/.test(item.event)
      ) {
        invalid += 1;
        continue;
      }
      const id = privacy.value(item.id, "id");
      const name = privacy.event(item.event);
      if (typeof id !== "string" || records.some((entry) => entry.id === id)) {
        continue;
      }
      const entry: DiagnosticRecord = {
        id,
        at: item.at,
        source: item.source,
        event: name,
        data: name === "diagnostic.unknown" ? {} : privacy.details(item.data),
      };
      if (typeof item.session === "string" && /^[a-z0-9-]{1,64}$/.test(item.session)) {
        const session = privacy.value(item.session, "session");
        if (typeof session === "string") {
          entry.session = session;
        }
      }
      if (
        typeof item.sequence === "number" &&
        isFinite(item.sequence) &&
        item.sequence > 0 &&
        Math.floor(item.sequence) === item.sequence
      ) {
        entry.sequence = item.sequence;
      }
      if (typeof item.elapsed_ms === "number" && isFinite(item.elapsed_ms) && item.elapsed_ms >= 0) {
        entry.elapsed_ms = item.elapsed_ms;
      }
      records.push(entry);
      total += JSON.stringify(entry).length;
      changed = true;
      while (records.length > DIAGNOSTIC_RECORD_LIMIT || total > MAX_CHARACTERS) {
        total -= JSON.stringify(records.shift()).length;
        discarded += 1;
      }
    }
    if (changed) {
      revision += 1;
      scheduleSave();
    }
    return true;
  };
  const stamp = <Data>(name: string, data: Data) => {
    elapsed = Math.max(elapsed, Math.round(mono() - origin));
    serial += 1;
    return {
      id: session + "-" + serial,
      session,
      sequence: serial,
      at: Date.now(),
      elapsed_ms: elapsed,
      source,
      event: privacy.event(name),
      data,
    };
  };
  const health = (): DiagnosticHealth => ({
    session,
    buffered: records.length,
    discarded,
    invalid,
    pending_errors: pendingErrors,
    storage: storageState,
    unsaved: revision !== saved,
    saving,
    writes,
    write_failures: writeFailures,
    read_failures: readFailures,
    clock: mono === Date.now ? "wall_fallback" : "monotonic",
  });
  return {
    record(name, data) {
      try {
        const entry = stamp(name, data);
        ingest([entry]);
        return entry.id;
      } catch {
        return null;
      }
    },
    captureError(name, error, context) {
      if (pendingErrors >= MAX_PENDING_ERRORS) {
        discarded += 1;
        return;
      }
      const entry = stamp(name, privacy.details(context));
      pendingErrors += 1;
      later(() => {
        pendingErrors -= 1;
        try {
          const failure = recordObject(error);
          const data = entry.data;
          data.error = typeof failure?.name === "string" ? failure.name : "Error";
          if (typeof failure?.message === "string") {
            data.message = failure.message;
          } else if (typeof error === "string") {
            data.message = error;
          } else {
            data.message = "Error details unavailable";
          }
          data.stack = typeof failure?.stack === "string" ? failure.stack : "";
          ingest([entry]);
        } catch {
          invalid += 1;
        }
      }, 0);
    },
    health,
    ingest,
    snapshot: (): DiagnosticSnapshot => ({
      schema_version: 1,
      health: health(),
      records: JSON.parse(JSON.stringify(records)) as DiagnosticRecord[],
    }),
    flushStorage: () => scheduleSave(0),
    attach(storage, ready) {
      if (!storage || loading || saving) {
        return;
      }
      store = storage;
      loading = true;
      storageState = "loading";
      const loaded = (error?: unknown, value?: string | null) => {
        if (!loading || store !== storage) {
          return;
        }
        if (error) {
          loading = false;
          store = null;
          storageState = "failed";
          readFailures += 1;
          ready?.();
          return;
        }
        const recent = records;
        try {
          const previous: unknown = value ? JSON.parse(value) : [];
          records = [];
          total = 0;
          if (!ingest(previous)) {
            invalid += 1;
          }
          ingest(recent);
        } catch {
          invalid += 1;
          records = recent;
          total = records.reduce((sum, item) => sum + JSON.stringify(item).length, 0);
        }
        loading = false;
        storageState = "ready";
        revision += 1;
        scheduleSave();
        ready?.();
      };
      try {
        storage.load(loaded);
      } catch (error) {
        loaded(error);
      }
    },
  };
};
