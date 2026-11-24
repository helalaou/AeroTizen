import catalog from "./desktopLogCatalog.json";

const LOG_STORAGE_KEY = "aerotizen.desktop.logs.v1";
export const LOG_LIMIT = 250;
const MAX_STORED_CHARACTERS = 128 * 1024;

export const LOG_ACTIONS = catalog.actions;
export const LOG_OUTCOMES = catalog.outcomes;

type LogAction = keyof typeof LOG_ACTIONS;
type LogOutcome = keyof typeof LOG_OUTCOMES;

export interface DesktopLogEntry {
  id: number;
  timestamp: string;
  action: LogAction;
  outcome: LogOutcome;
  durationMs: number | null;
  code: string | null;
}

type LogStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): LogStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function knownCode(value: unknown): string | null {
  return catalog.errorCodes.find((code) => code === value) ?? null;
}

function parseEntry(value: unknown): DesktopLogEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, timestamp, action, outcome, durationMs, code } = value as Partial<DesktopLogEntry>;
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof timestamp !== "string" ||
    typeof action !== "string" ||
    !Object.hasOwn(LOG_ACTIONS, action) ||
    typeof outcome !== "string" ||
    !Object.hasOwn(LOG_OUTCOMES, outcome)
  )
    return null;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return null;
  return {
    id,
    timestamp: new Date(time).toISOString(),
    action,
    outcome,
    durationMs:
      typeof durationMs === "number" && Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
    code: outcome === "failed" ? (knownCode(code) ?? "request_failed") : null,
  };
}

function loadEntries(storage: LogStorage | undefined, key: string): DesktopLogEntry[] {
  try {
    const stored = storage?.getItem(key);
    if (!stored || stored.length > MAX_STORED_CHARACTERS) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, LOG_LIMIT).flatMap((value: unknown) => {
      const entry = parseEntry(value);
      return entry ? [entry] : [];
    });
  } catch {
    return [];
  }
}

export function createDesktopLog(simulator = false, storage = browserStorage()) {
  const key = simulator ? `${LOG_STORAGE_KEY}.simulator` : LOG_STORAGE_KEY;
  let entries = loadEntries(storage, key);
  let nextId = entries.reduce((last, entry) => Math.max(last, entry.id), 0) + 1;
  const listeners = new Set<() => void>();

  function record(
    action: LogAction,
    outcome: LogOutcome,
    durationMs: number | null = null,
    code: string | null = null,
  ) {
    entries = [
      { id: nextId++, timestamp: new Date().toISOString(), action, outcome, durationMs, code },
      ...entries,
    ].slice(0, LOG_LIMIT);
    try {
      storage?.setItem(key, JSON.stringify(entries));
    } catch {
      // The current session can still show and export the in-memory log.
    }
    listeners.forEach((listener) => listener());
  }

  async function track<Result>(
    action: LogAction,
    request: () => Promise<Result>,
    options?: {
      signal?: AbortSignal;
      outcome?(result: Result): Exclude<LogOutcome, "started" | "failed">;
    },
  ): Promise<Result> {
    const start = performance.now();
    record(action, "started");
    const elapsed = () => Math.max(0, Math.round(performance.now() - start));
    try {
      const result = await request();
      record(action, options?.signal?.aborted ? "cancelled" : (options?.outcome?.(result) ?? "completed"), elapsed());
      return result;
    } catch (error) {
      if (options?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        record(action, "cancelled", elapsed());
      } else {
        const code = typeof error === "object" && error !== null && "code" in error ? knownCode(error.code) : null;
        record(action, "failed", elapsed(), code ?? "request_failed");
      }
      throw error;
    }
  }

  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recordOpened: () => record("open", "completed"),
    track,
  };
}

export type DesktopLog = ReturnType<typeof createDesktopLog>;

export function formatDesktopLog(entries: readonly DesktopLogEntry[], simulator: boolean): string {
  const heading = simulator ? "AeroTizen desktop logs (simulator)" : "AeroTizen desktop logs";
  const records = entries.map(({ timestamp, action, outcome, durationMs, code }) =>
    [timestamp, LOG_ACTIONS[action], LOG_OUTCOMES[outcome], durationMs === null ? null : `${durationMs} ms`, code]
      .filter((field) => field !== null)
      .join("\t"),
  );
  return [heading, "Newest first. Times are in UTC.", "", ...records, ""].join("\n");
}
