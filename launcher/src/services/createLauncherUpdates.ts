import type { LauncherUpdateCheck, LauncherUpdateNotice, LauncherUpdateSnapshot } from "../contracts/updates";
import { createStore } from "../shared/state/createStore";

const RELEASES = "https://api.github.com/repos/helalaou/AeroTizen/releases?per_page=100";
const CACHE_KEY = "aerotizen.launcherUpdate.check";
const ACKNOWLEDGEMENT_KEY = "aerotizen.launcherUpdate.acknowledgement";
// A few requests a day stay far below GitHub's anonymous limit of 60 an hour per address.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Keeps repeated presses of "Check for updates" from spending that limit.
const MANUAL_INTERVAL_MS = 60 * 1000;
const TIMEOUT_MS = 8000;
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const MAX_NOTES = 4;
const MAX_NOTE_LENGTH = 120;

const readNotes = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[])
    .filter((note): note is string => typeof note === "string" && note.trim().length > 0)
    .slice(0, MAX_NOTES)
    .map((note) => (note.length > MAX_NOTE_LENGTH ? note.slice(0, MAX_NOTE_LENGTH - 1).trim() + "…" : note));
};

const releaseNotes = (body: unknown) => {
  if (typeof body !== "string") {
    return [];
  }
  // Release Please writes one bullet per change, with optional scope and GitHub references.
  const bullets = body.match(/^[*+-] .+$/gm) || [];
  return readNotes(
    bullets.map((bullet) =>
      bullet
        .slice(2)
        .replace(/^\*\*[^*]+:\*\*\s*/, "")
        .replace(/\s*\(\[[^\]]+\]\(https:\/\/github\.com\/[^)]+\)\)/g, "")
        .replace(/,?\s+(?:closes|fixes|resolves)\s+\[#[0-9]+\]\(https:\/\/github\.com\/[^)]+\).*$/i, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*|`([^`]+)`/g, "$1$2")
        .trim(),
    ),
  );
};

const isVersion = (value: unknown): value is string => typeof value === "string" && VERSION.test(value);

const isNewer = (candidate: string, current: string) => {
  const left = candidate.split(".").map(Number);
  const right = current.split(".").map(Number);
  const different = left.findIndex((part, index) => part !== right[index]);
  return different !== -1 && left[different] > right[different];
};

const readStored = (key: string) => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const saveStored = (key: string, value: object) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the notice usable in this session when storage is unavailable.
  }
};

const findLatestLauncher = async (signal: AbortSignal) => {
  let latest: { version: string; body: unknown } | null = null;
  // CLI and launcher releases share this feed. Compare launcher versions across pages.
  for (let page = 1; ; page++) {
    const response = await fetch(RELEASES + "&page=" + page, { signal, credentials: "omit" });
    if (!response.ok) {
      throw new Error("Could not check launcher releases");
    }
    const releases: unknown = await response.json();
    if (!Array.isArray(releases)) {
      throw new Error("Invalid launcher release list");
    }
    for (const item of releases as unknown[]) {
      if (
        !item ||
        typeof item !== "object" ||
        !("tag_name" in item) ||
        typeof item.tag_name !== "string" ||
        !item.tag_name.startsWith("launcher-v") ||
        !("draft" in item) ||
        item.draft !== false ||
        !("prerelease" in item) ||
        item.prerelease !== false
      ) {
        continue;
      }
      const version = item.tag_name.slice("launcher-v".length);
      if (isVersion(version) && (latest === null || isNewer(version, latest.version))) {
        latest = { version, body: "body" in item ? item.body : null };
      }
    }
    if (!/;\s*rel="next"/.test(response.headers.get("Link") || "")) {
      return latest;
    }
  }
};

export interface LauncherUpdates extends LauncherUpdateNotice {
  check(): Promise<void>;
  dispose(): void;
}

export const createLauncherUpdates = (installedVersion: string): LauncherUpdates => {
  const cached = readStored(CACHE_KEY);
  const storedAck = readStored(ACKNOWLEDGEMENT_KEY);
  let latest = cached && "latest" in cached && isVersion(cached.latest) ? cached.latest : null;
  let notes = readNotes(cached && "notes" in cached ? cached.notes : null);
  let attemptedAt =
    cached && "attemptedAt" in cached && typeof cached.attemptedAt === "number" ? cached.attemptedAt : 0;
  let acknowledged =
    storedAck &&
    "installedVersion" in storedAck &&
    isVersion(storedAck.installedVersion) &&
    "latestVersion" in storedAck &&
    isVersion(storedAck.latestVersion)
      ? { installedVersion: storedAck.installedVersion, latestVersion: storedAck.latestVersion }
      : null;
  let request: AbortController | undefined;
  let disposed = false;
  let manual: LauncherUpdateCheck = "idle";

  const snapshot = (): LauncherUpdateSnapshot => {
    const latestVersion = latest && isVersion(installedVersion) && isNewer(latest, installedVersion) ? latest : null;
    const unread = Boolean(
      latestVersion &&
      (!acknowledged ||
        (isNewer(installedVersion, acknowledged.installedVersion) &&
          isNewer(latestVersion, acknowledged.latestVersion))),
    );
    return { check: manual, installedVersion, latestVersion, releaseNotes: latestVersion ? notes : [], unread };
  };
  const store = createStore(snapshot());
  const publish = (check: LauncherUpdateCheck) => {
    manual = check;
    store.set(snapshot());
  };
  // After a check from Settings, an update shows its own notice; otherwise confirm the version is current.
  const settledCheck = (): LauncherUpdateCheck => (snapshot().latestVersion ? "idle" : "current");
  const run = async (intervalMs: number, fromSettings: boolean) => {
    const now = Date.now();
    if (disposed || request || !isVersion(installedVersion)) {
      return;
    }
    if (now >= attemptedAt && now - attemptedAt < intervalMs) {
      if (fromSettings) {
        // Checked moments ago. Report that result instead of asking GitHub again.
        publish(settledCheck());
      }
      return;
    }
    if (fromSettings) {
      publish("checking");
    }
    attemptedAt = now;
    saveStored(CACHE_KEY, { latest, notes, attemptedAt });
    const controller = new AbortController();
    request = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const found = await findLatestLauncher(controller.signal);
      if (!controller.signal.aborted) {
        latest = found?.version ?? null;
        notes = releaseNotes(found?.body);
        saveStored(CACHE_KEY, { latest, notes, attemptedAt });
        publish(manual === "checking" ? settledCheck() : manual);
      }
    } catch {
      // Keep the last known result. A failed request also waits for the next interval.
      if (manual === "checking" && !disposed) {
        publish("failed");
      }
    } finally {
      window.clearTimeout(timeout);
      request = undefined;
    }
  };
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    acknowledge() {
      const { latestVersion, unread } = store.getSnapshot();
      if (latestVersion && unread) {
        acknowledged = { installedVersion, latestVersion };
        saveStored(ACKNOWLEDGEMENT_KEY, acknowledged);
        store.set(snapshot());
      }
    },
    check: () => run(CHECK_INTERVAL_MS, false),
    checkNow() {
      if (request) {
        // A background check is already running. Show its result when it finishes.
        publish("checking");
        return;
      }
      void run(MANUAL_INTERVAL_MS, true);
    },
    dispose() {
      disposed = true;
      request?.abort();
    },
  };
};
