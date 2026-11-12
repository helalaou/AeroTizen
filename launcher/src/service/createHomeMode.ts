import { LAUNCHER_APP_ID } from "./protocol";

const HOME_ROUTING_KEY = "aerotizen.home-routing.v1";
const HOME_CONTROL_PROTOCOL = 1;
const TRANSACTION_PATTERN = /^[a-f0-9]{32}$/;
const BASELINE_HASH_PATTERN = /^[a-f0-9]{64}$/;

export interface HomePreference {
  exists(key: string): boolean;
  getValue(key: string): string;
  setValue(key: string, value: string): void;
}

interface HomeReceipt {
  readonly baseline_sha256: string | null;
  readonly mode: "watcher" | "hold" | "native" | "blocked";
  readonly transaction: string | null;
}

const fields = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : null;

const validReceipt = (input: unknown): input is HomeReceipt => {
  const value = fields(input);
  if (!value) {
    return false;
  }
  if (value.mode === "watcher") {
    return value.transaction === null && value.baseline_sha256 === null;
  }
  return (
    (value.mode === "native" || value.mode === "hold") &&
    typeof value.transaction === "string" &&
    TRANSACTION_PATTERN.test(value.transaction) &&
    typeof value.baseline_sha256 === "string" &&
    BASELINE_HASH_PATTERN.test(value.baseline_sha256)
  );
};

// Only native control changes this receipt. Ordinary launcher events cannot.
const createHomeMode = (preference: Partial<HomePreference> | null, changed: () => void, blocked = false) => {
  const storage =
    preference?.exists && preference.getValue && preference.setValue ? (preference as HomePreference) : null;
  let saved: HomeReceipt = { mode: blocked ? "blocked" : "watcher", transaction: null, baseline_sha256: null };
  try {
    if (storage?.exists(HOME_ROUTING_KEY)) {
      const value: unknown = JSON.parse(storage.getValue(HOME_ROUTING_KEY));
      if (!validReceipt(value)) {
        throw new Error("Invalid saved Home mode");
      }
      saved = value;
    }
  } catch {
    saved = { mode: "blocked", transaction: null, baseline_sha256: null };
  }
  const read = () => ({
    protocol: HOME_CONTROL_PROTOCOL,
    app_id: LAUNCHER_APP_ID,
    persistent: !!storage,
    mode: saved.mode,
    transaction: saved.transaction,
    baseline_sha256: saved.baseline_sha256,
  });
  const change = (input: unknown) => {
    if (!storage) {
      throw new Error("Persistent Home mode is unavailable");
    }
    const request = fields(input);
    if (
      !request ||
      request.expected_mode !== saved.mode ||
      request.expected_transaction !== saved.transaction ||
      request.expected_baseline_sha256 !== saved.baseline_sha256
    ) {
      throw new Error("Home mode changed; read it again");
    }
    const next = { mode: request.mode, transaction: request.transaction, baseline_sha256: request.baseline_sha256 };
    if (
      !validReceipt(next) ||
      saved.mode === "blocked" ||
      (next.mode === "hold"
        ? saved.mode !== "watcher" && next.baseline_sha256 !== saved.baseline_sha256
        : saved.mode !== "hold" ||
          (next.mode === "native" &&
            (next.transaction !== saved.transaction || next.baseline_sha256 !== saved.baseline_sha256)))
    ) {
      throw new Error("Invalid Home handoff transition");
    }
    const encoded = JSON.stringify(next);
    try {
      storage.setValue(HOME_ROUTING_KEY, encoded);
      if (storage.getValue(HOME_ROUTING_KEY) !== encoded) {
        throw new Error("Home mode readback failed");
      }
      saved = next;
    } catch (error) {
      saved = { mode: "blocked", transaction: saved.transaction, baseline_sha256: saved.baseline_sha256 };
      changed();
      throw error;
    }
    changed();
    return read();
  };
  return { read, change };
};

export default createHomeMode;
