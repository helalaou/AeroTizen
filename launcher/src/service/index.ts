import type { ClientRequest, IncomingMessage, Server, ServerResponse } from "http";

import type { DiagnosticHealth, DiagnosticRecord, DiagnosticStorage } from "../contracts/diagnostics";
import type contextFactory from "../diagnostics/context";
import type { DiagnosticsStorageHost } from "../diagnostics/service/openDiagnosticsStore";
import type storageFactory from "../diagnostics/storage";

import type artFactory from "./createArtMode";
import type { ArtModeStatus } from "./createArtMode";
import type modeFactory from "./createHomeMode";
import type storeFactory from "./openHomeStore";
import {
  LAUNCHER_APP_ID,
  LOOPBACK_HOST,
  SAMSUNG_API_PORT,
  SAMSUNG_APPLICATIONS_PATH,
  SAMSUNG_INFO_PATH,
  WATCHER_PORT,
} from "./protocol";

type ServiceTimer = ReturnType<typeof setTimeout>;
type ApiReply = Readonly<Record<string, unknown>>;
type TvCapability = "unknown" | "frame" | "non-frame" | "not-advertised";

interface AppStatus {
  readonly running: boolean;
  readonly visible: boolean;
}

interface AppSnapshot {
  complete: boolean;
  running: Record<string, boolean>;
  visible: string | null;
}

interface LaunchCandidate {
  readonly epoch: number;
  readonly reason: string;
  timer: ServiceTimer | undefined;
  readonly watched: string | null;
}

interface WatcherState {
  apps: string[];
  epoch: number;
  guard: {
    capability: TvCapability;
    artMode: ArtModeStatus | "not-supported";
    pending: { reason: string; at: number } | null;
    lastBlocked: string | null;
    launchCalls: number;
    history: { at: number; kind: string; detail: string }[];
  };
  heartbeats: number;
  hiddenSince: number;
  last: string | null;
  lastLaunch: number;
  leaving: boolean;
  running: Record<string, boolean>;
  seen: boolean;
  selfVisible: boolean | null;
  snapAt?: number;
  startup?: ApiReply;
  unseenScanAt?: number;
  watchAt: number;
  watched: string | null;
  watchedHiddenSince: number;
  watchedRan?: boolean;
  watchedStoppedSince?: number;
}

interface ServiceDiagnostics {
  attach(storage: DiagnosticStorage): void;
  flushStorage(): void;
  ingest(events: unknown): boolean;
  record(name: string, data?: unknown): void;
  snapshot(): { schema_version: 1; records: DiagnosticRecord[]; health?: DiagnosticHealth };
}

interface ServiceDiagnosticContext {
  accept(value: unknown): void;
  enrich(snapshot: object, control: ReturnType<ReturnType<typeof modeFactory>["read"]>, state: WatcherState): object;
  start(): void;
}

declare const tizen: DiagnosticsStorageHost & {
  readonly application: {
    launch(id: string, ready: () => void, failed: (error?: { message?: string } | null) => void): void;
  };
};
declare const require: {
  (name: "http"): typeof import("http");
  (name: "url"): typeof import("url");
  (name: "./artmode"): typeof artFactory;
  (name: "./home-mode"): typeof modeFactory;
  (name: "./home-store"): typeof storeFactory;
  (name: "./diagnostics"): { createDiagnostics(source: "service"): ServiceDiagnostics };
  (name: "./diagnostics-context"): typeof contextFactory;
  (name: "./diagnostics-store"): typeof storageFactory;
};

const object = (value: unknown): ApiReply | null =>
  value !== null && typeof value === "object" ? (value as ApiReply) : null;
const errorMessage = (value: unknown) => {
  const message = object(value)?.message;
  return typeof message === "string" ? message : undefined;
};
const eventBatch = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }
  const packet = object(value);
  return packet?.schema_version === DIAGNOSTIC_SCHEMA_VERSION ? packet.records : null;
};

const isAppStatus = (value: ApiReply | null): value is ApiReply & AppStatus =>
  value !== null && typeof value.running === "boolean" && typeof value.visible === "boolean";

const tvCapability = (info: ApiReply | null): TvCapability => {
  const device = object(info?.device);
  const flag = device?.FrameTVSupport;
  if (flag === true || flag === "true") {
    return "frame";
  }
  if (flag === false || flag === "false") {
    return "non-frame";
  }
  const validDevice =
    device &&
    !Array.isArray(device) &&
    ((typeof device.modelName === "string" && device.modelName.length > 0) ||
      (typeof device.model === "string" && device.model.length > 0) ||
      device.PowerState === "on" ||
      device.PowerState === "standby" ||
      device.PowerState === "off");
  return validDevice && !Object.prototype.hasOwnProperty.call(device, "FrameTVSupport") ? "not-advertised" : "unknown";
};

// Background watcher that makes the launcher behave like the TV's home screen.
// Hidden web apps are frozen on retail TVs, so this runs as a Tizen web service started at
// boot. It polls the TV's local API (port 8001) and relaunches the launcher when Samsung
// Home covers it, while standing aside for apps opened elsewhere (e.g. a phone cast).
//
// Frame TVs get an extra guard: Art Mode also hides the launcher, so every relaunch there
// needs two fresh "Art Mode off" replies and a recheck of the screen. Other TVs keep the
// fast path (short grace period, direct relaunch). The launcher talks to this service over
// http://127.0.0.1:47790.
const http = require("http");
const createArtMode = require("./artmode");
let diagnostics: ServiceDiagnostics = {
  record: function () {},
  flushStorage: function () {},
  attach: function () {},
  ingest: function () {
    return false;
  },
  snapshot: function () {
    return { schema_version: 1, records: [] };
  },
};
try {
  diagnostics = require("./diagnostics").createDiagnostics("service");
} catch (e) {
  /* optional diagnostics */
}
let diagnosticContext: ServiceDiagnosticContext = {
  start: function () {},
  accept: function () {},
  enrich: function (value: object) {
    return value;
  },
};
try {
  diagnosticContext = require("./diagnostics-context")();
} catch (e) {
  /* optional metadata */
}
const SELF = LAUNCHER_APP_ID;
const HIDDEN_GRACE_MS = 250; // non-Frame: Samsung Home appears almost at once
const FRAME_HIDDEN_GRACE_MS = 1500; // Frame: give Art Mode time to report before reclaiming
const WATCHED_HIDDEN_GRACE_MS = 1500; // non-Frame: an app can briefly report invisible during transitions
const APP_GRACE_MS = 2500;
const WATCH_STOP_GRACE_MS = 1500; // a watched app must stay stopped this long before it's dropped
const WATCH_COVER_GRACE_MS = 10000; // an app the launcher opened may take this long to cover it
const INVENTORY_SCAN_INTERVAL_MS = 5000; // same pace as the visible snapshot: other apps while one is unseen
const BOOT_DELAY_MS = 3000;
const BOOT_FALLBACK_MS = 15000; // launch anyway if the TV type is still unknown
const API_REQUEST_TIMEOUT_MS = 1500;
const MAX_API_REPLY_CHARACTERS = 65536;
const LAUNCH_COOLDOWN_MS = 2000;
const GUARD_DEADLINE_MS = 6000;
const SCAN_WATCHDOG_MS = 2000;
const CAPABILITY_RETRY_MS = 5000;
const WATCHER_POLL_INTERVAL_MS = 300;
const GUARD_HISTORY_LIMIT = 100;
const MAX_MODE_REQUEST_CHARACTERS = 4096;
const MAX_EVENT_BATCH_CHARACTERS = 16384;
const MAX_EVENT_BATCH_RECORDS = 24;
const DIAGNOSTIC_SCHEMA_VERSION = 1;
const MAX_STARTUP_TRACE_CHARACTERS = 4096;
const MAX_STARTUP_MARKS = 32;
const HOME_CONTROL_PATH = "/control/home";
const DIAGNOSTIC_PATHS = { logs: "/diagnostics/logs", events: "/diagnostics/events" } as const;
const LOCAL_CONTROL_MARKER = "1";
const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  conflict: 409,
  tooLarge: 413,
  unsupportedMedia: 415,
} as const;

let started = false;
let stopped = false;
let server: Server | null = null;
let interval: ServiceTimer | undefined;
let capabilityRetry: ServiceTimer | undefined;
let busy = false;
let scanNumber = 0;
let pending: LaunchCandidate | null = null;
let bootUntil = 0;
let bootDone = false;
let bootFallback: ServiceTimer | undefined;
let bootTimer: ServiceTimer | undefined;
const state: WatcherState = {
  watched: null,
  seen: false,
  leaving: false,
  apps: [],
  running: {},
  selfVisible: null,
  hiddenSince: 0,
  watchedHiddenSince: 0,
  watchAt: 0,
  lastLaunch: 0,
  last: null,
  epoch: 0,
  heartbeats: 0,
  guard: {
    capability: "unknown",
    artMode: "unknown",
    pending: null,
    lastBlocked: null,
    launchCalls: 0,
    history: [],
  },
};
const createHomeMode = require("./home-mode");
let homeMode = createHomeMode(null, updateMode, true);
function watcherEnabled() {
  return !stopped && homeMode.read().mode === "watcher";
}

function record(kind: string, detail: string) {
  diagnostics.record("watcher." + kind, { reason: detail });
  state.guard.history.push({ at: Date.now(), kind: kind, detail: detail });
  if (state.guard.history.length > GUARD_HISTORY_LIMIT) {
    state.guard.history.shift();
  }
}
function block(reason: string) {
  if (state.guard.lastBlocked !== reason) {
    record("blocked", reason);
  }
  state.guard.lastBlocked = reason;
}
function invalidate(reason: string) {
  state.epoch += 1;
  if (pending) {
    clearTimeout(pending.timer);
    record("cancelled", reason);
  }
  pending = null;
  state.guard.pending = null;
}
// Call whenever state.watched changes: what we learned about the previous app doesn't carry over.
function resetWatchedTiming() {
  state.watchedHiddenSince = 0;
  state.watchedRan = false;
  state.watchedStoppedSince = 0;
}
function resetHiddenTiming() {
  state.hiddenSince = 0;
  state.watchedHiddenSince = 0;
  state.watchedStoppedSince = 0;
  state.selfVisible = null;
  state.watchAt = Date.now();
}
function resetTracking() {
  state.watched = null;
  state.seen = false;
  resetWatchedTiming();
  resetHiddenTiming();
}

const art = createArtMode({
  onChange: function (value, reason) {
    const previous = state.guard.artMode;
    state.guard.artMode = value;
    if (value !== "off" || previous !== "off") {
      invalidate("Art status: " + value);
      if (value !== previous) {
        resetHiddenTiming();
        record("art-status", value);
      }
    }
    if (value !== "off") {
      block("Art status: " + value + " (" + reason + ")");
    }
  },
});

function get(path: string, cb: (value: ApiReply | null, unavailable: boolean) => void) {
  let settled = false;
  let req: ClientRequest | null = null;
  const timer = setTimeout(function () {
    finish(null, false);
    if (req) {
      req?.destroy();
    }
  }, API_REQUEST_TIMEOUT_MS);
  function finish(value: ApiReply | null, unavailable: boolean) {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
    cb(value, unavailable);
  }
  try {
    req = http.get({ host: LOOPBACK_HOST, port: SAMSUNG_API_PORT, path: path }, function (res) {
      let body = "";
      res.on("data", function (chunk: string | Buffer) {
        body += chunk.toString();
        if (body.length > MAX_API_REPLY_CHARACTERS) {
          finish(null, false);
          req?.destroy();
        }
      });
      res.on("error", function () {
        finish(null, false);
      });
      res.on("end", function () {
        if (res.statusCode === HTTP_STATUS.notFound) {
          finish(null, true);
          return;
        }
        if (res.statusCode !== HTTP_STATUS.ok) {
          finish(null, false);
          return;
        }
        let value: ApiReply | null = null;
        try {
          value = object(JSON.parse(body));
        } catch (e) {
          /* Invalid data blocks a relaunch. */
        }
        finish(value, false);
      });
    });
    req.on("error", function () {
      finish(null, false);
    });
  } catch (e) {
    finish(null, false);
  }
}
function appStatus(id: string, cb: (value: AppStatus | null, unavailable: boolean) => void) {
  get(SAMSUNG_APPLICATIONS_PATH + encodeURIComponent(id), function (value, unavailable) {
    cb(isAppStatus(value) ? value : null, unavailable);
  });
}
function snapshot(cb: (value: AppSnapshot) => void) {
  const ids = state.apps.slice();
  let left = ids.length;
  const result: AppSnapshot = { running: {}, visible: null, complete: true };
  if (!left) {
    cb(result);
    return;
  }
  ids.forEach(function (id) {
    appStatus(id, function (value, unavailable) {
      if (!value && !unavailable) {
        result.complete = false;
      }
      result.running[id] = !!(value && value.running);
      if (value && value.visible) {
        result.visible = id;
      }
      left -= 1;
      if (!left) {
        cb(result);
      }
    });
  });
}
function standAside(result: AppSnapshot, knownApp?: string | null) {
  let id = result.visible;
  if (!id) {
    for (const key in result.running) {
      if (key !== knownApp && result.running[key] && !state.running[key]) {
        id = key;
        break;
      }
    }
  }
  state.running = result.running;
  if (!id) {
    return false;
  }
  invalidate("another app is active");
  state.watched = id;
  state.seen = result.visible === id;
  resetWatchedTiming();
  state.last = "stand aside: " + id;
  return true;
}
function isFrame() {
  return state.guard.capability === "frame";
}
function hiddenGrace() {
  return isFrame() ? FRAME_HIDDEN_GRACE_MS : HIDDEN_GRACE_MS;
}
function launchNow(why: string) {
  if (!watcherEnabled() || state.leaving) {
    return;
  }
  if (Date.now() - state.lastLaunch < LAUNCH_COOLDOWN_MS) {
    return;
  }
  commitLaunch(why);
}
function commitLaunch(why: string) {
  state.lastLaunch = Date.now();
  state.watched = null;
  state.seen = false;
  state.guard.lastBlocked = null;
  state.guard.launchCalls += 1;
  record("launch", why);
  try {
    tizen.application.launch(
      SELF,
      function () {
        state.last = "relaunched: " + why;
      },
      function (e?: { message?: string } | null) {
        state.last = "relaunch failed: " + (e && e.message);
      },
    );
  } catch (e) {
    state.last = "relaunch threw: " + errorMessage(e);
  }
}
// Open the launcher once at boot on non-Frame TVs. Frame TVs leave this to the guarded
// watcher, so a Frame booting into Art Mode stays there. If the type never resolves, launch
// anyway: a TV that boots to Samsung Home is worse than a rare Art interruption.
function bootLaunch() {
  if (bootDone || !watcherEnabled() || state.leaving) {
    return;
  }
  bootDone = true;
  clearTimeout(bootFallback);
  bootTimer = setTimeout(
    function () {
      if (!watcherEnabled() || state.leaving) {
        return;
      }
      if (state.guard.capability === "unknown") {
        launchNow("boot (TV type unknown)");
      } else if (!isFrame()) {
        launchSelf("boot");
      }
    },
    Math.max(0, bootUntil - Date.now()),
  );
}
function permitted() {
  if (!watcherEnabled()) {
    block("Native Home or handoff mode");
    return false;
  }
  if (state.guard.capability === "non-frame" || state.guard.capability === "not-advertised") {
    return true;
  }
  if (state.guard.capability !== "frame") {
    block("TV capability unknown");
    return false;
  }
  if (state.guard.artMode !== "off") {
    block("Art status: " + state.guard.artMode);
    return false;
  }
  return true;
}
function freshOff(cb: (value: ArtModeStatus) => void) {
  if (state.guard.capability === "non-frame" || state.guard.capability === "not-advertised") {
    cb("off");
    return;
  }
  if (state.guard.capability !== "frame") {
    cb("unknown");
    return;
  }
  art.fresh(cb);
}
function current(candidate: LaunchCandidate) {
  return (
    watcherEnabled() &&
    !state.leaving &&
    pending === candidate &&
    candidate.epoch === state.epoch &&
    candidate.watched === state.watched
  );
}
function cancel(candidate: LaunchCandidate, reason: string) {
  if (pending !== candidate) {
    return;
  }
  block(reason);
  invalidate(reason);
}
function recheck(candidate: LaunchCandidate, cb: () => void) {
  function ready() {
    if (state.guard.capability !== "frame") {
      cb();
      return;
    }
    get(SAMSUNG_INFO_PATH, function (info) {
      if (!current(candidate)) {
        return;
      }
      if (!info || object(info.device)?.PowerState !== "on") {
        cancel(candidate, "TV power state unavailable or not on");
        return;
      }
      cb();
    });
  }
  appStatus(SELF, function (me) {
    if (!current(candidate)) {
      return;
    }
    if (!me || me.visible) {
      cancel(candidate, "launcher visible or status unavailable");
      return;
    }
    if (candidate.watched) {
      appStatus(candidate.watched, function (watched) {
        if (!current(candidate)) {
          return;
        }
        if (!watched || watched.visible || !state.seen) {
          cancel(candidate, "watched app visible or status unavailable");
          return;
        }
        // Also check other apps: a cast can start while a watched app closes.
        snapshot(function (result) {
          if (!current(candidate)) {
            return;
          }
          if (!result.complete) {
            cancel(candidate, "app inventory unavailable");
            return;
          }
          if (standAside(result, candidate.watched)) {
            return;
          }
          ready();
        });
      });
    } else {
      snapshot(function (result) {
        if (!current(candidate)) {
          return;
        }
        if (!result.complete) {
          cancel(candidate, "app inventory unavailable");
          return;
        }
        if (standAside(result)) {
          return;
        }
        ready();
      });
    }
  });
}
function launchSelf(why: string) {
  if (pending || state.leaving || stopped || !permitted()) {
    return;
  }
  if (!isFrame()) {
    launchNow(why);
    return;
  }
  if (Date.now() - state.lastLaunch < LAUNCH_COOLDOWN_MS) {
    return;
  }
  const candidate: LaunchCandidate = { epoch: state.epoch, watched: state.watched, reason: why, timer: undefined };
  pending = candidate;
  state.guard.pending = { reason: why, at: Date.now() };
  record("checking", why);
  candidate.timer = setTimeout(function () {
    cancel(candidate, "guard deadline");
  }, GUARD_DEADLINE_MS);
  // First read protects the app checks; a second read authorizes the launch itself.
  freshOff(function (value) {
    if (!current(candidate)) {
      return;
    }
    if (value !== "off") {
      cancel(candidate, "fresh Art status: " + value);
      return;
    }
    recheck(candidate, function () {
      if (!current(candidate)) {
        return;
      }
      freshOff(function (finalValue) {
        if (!current(candidate)) {
          return;
        }
        if (finalValue !== "off" || !permitted()) {
          cancel(candidate, "final Art check blocked");
          return;
        }
        // Let a veto frame already buffered after this reply cancel the candidate.
        setTimeout(function () {
          if (!current(candidate) || !permitted()) {
            return;
          }
          clearTimeout(candidate.timer);
          pending = null;
          state.guard.pending = null;
          commitLaunch(why);
        }, 0);
      });
    });
  });
}

function tick() {
  state.heartbeats += 1;
  if (!watcherEnabled() || state.leaving || busy || pending || Date.now() < bootUntil || !permitted()) {
    return;
  }
  busy = true;
  const number = ++scanNumber;
  const epoch = state.epoch;
  let finished = false;
  const watchdog = setTimeout(done, SCAN_WATCHDOG_MS);
  function done() {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(watchdog);
    if (number === scanNumber) {
      busy = false;
    }
  }
  function valid() {
    return !finished && watcherEnabled() && !state.leaving && epoch === state.epoch && number === scanNumber;
  }
  appStatus(SELF, function (me) {
    if (!valid() || !me) {
      done();
      return;
    }
    const now = Date.now();
    if (me.visible) {
      state.selfVisible = true;
      state.hiddenSince = 0;
      // The launcher stays on screen for a moment after opening an app; keep that watch until the
      // app has had time to cover it. A real return to the launcher resets it through /home.
      if (now - state.watchAt >= WATCH_COVER_GRACE_MS) {
        state.watched = null;
        state.seen = false;
        resetWatchedTiming();
      }
      if (now - (state.snapAt || 0) > INVENTORY_SCAN_INTERVAL_MS) {
        state.snapAt = now;
        snapshot(function (result) {
          if (valid() && (result.complete || !isFrame())) {
            state.running = result.running;
          }
          done();
        });
      } else {
        done();
      }
      return;
    }
    if (state.selfVisible !== false) {
      state.hiddenSince = now;
    }
    state.selfVisible = false;
    const settling = now - state.hiddenSince < hiddenGrace() || now - state.watchAt < APP_GRACE_MS;
    // Frame waits out the grace period even for a watched app; other TVs check it at once.
    if (settling && isFrame()) {
      done();
      return;
    }
    if (state.watched) {
      const id = state.watched;
      appStatus(id, function (watched) {
        if (!valid() || state.watched !== id || !watched) {
          done();
          return;
        }
        if (watched.visible) {
          state.seen = true;
          state.watchedHiddenSince = 0;
        } else if (state.seen) {
          if (!state.watchedHiddenSince) {
            state.watchedHiddenSince = Date.now();
          }
          const grace = isFrame() ? FRAME_HIDDEN_GRACE_MS : WATCHED_HIDDEN_GRACE_MS;
          if (Date.now() - state.watchedHiddenSince >= grace) {
            launchSelf("home pressed in " + id);
          }
        } else if (watched.running) {
          state.watchedRan = true;
          state.watchedStoppedSince = 0;
          if (Date.now() - (state.unseenScanAt || 0) >= INVENTORY_SCAN_INTERVAL_MS) {
            // Some apps (YouTube, some third-party players) never report themselves visible.
            // Meanwhile, follow any app that does, e.g. one opened from Samsung Home, so Home in
            // it still returns.
            state.unseenScanAt = Date.now();
            snapshot(function (result) {
              if (valid() && state.watched === id && result.visible && result.visible !== id) {
                record("unseen", id + " never reported visible; following " + result.visible);
                standAside(result, id);
              }
              done();
            });
            return;
          }
        } else if (state.watchedRan) {
          // It ran and has stayed stopped, so it closed and can't be covering the launcher.
          // Without this, an app that never reports itself visible held the watcher forever.
          if (!state.watchedStoppedSince) {
            state.watchedStoppedSince = Date.now();
          }
          if (Date.now() - (state.watchedStoppedSince || 0) >= WATCH_STOP_GRACE_MS) {
            record("unwatched", id + " stopped running");
            state.watched = null;
            state.watchedHiddenSince = 0;
          }
        }
        done();
      });
      return;
    }
    if (settling) {
      done();
      return;
    }
    snapshot(function (result) {
      if (!valid()) {
        done();
        return;
      }
      // A failed status reads as "not running" except on Frame TVs, where any gap blocks a
      // relaunch. The TV's API can stall for seconds while Samsung Home loads.
      if ((result.complete || !isFrame()) && !standAside(result)) {
        launchSelf("covered without an app");
      }
      done();
    });
  });
}

function discoverCapability() {
  if (!watcherEnabled()) {
    return;
  }
  get(SAMSUNG_INFO_PATH, function (info) {
    if (!watcherEnabled()) {
      return;
    }
    // Missing optional flags on a valid TV keep the non-Frame path.
    const capability = tvCapability(info);
    state.guard.capability = capability;
    record("capability", capability);
    if (capability === "frame") {
      art.start();
      bootLaunch();
    } else if (capability === "non-frame" || capability === "not-advertised") {
      state.guard.artMode = "not-supported";
      bootLaunch();
    } else {
      block("TV capability unknown");
      capabilityRetry = setTimeout(discoverCapability, CAPABILITY_RETRY_MS);
    }
  });
}
function updateMode() {
  diagnostics.record("service.mode", { mode: homeMode.read().mode });
  invalidate("Home routing mode changed");
  resetTracking();
  scanNumber += 1;
  busy = false;
  clearInterval(interval);
  clearTimeout(capabilityRetry);
  clearTimeout(bootFallback);
  clearTimeout(bootTimer);
  if (interval || capabilityRetry || bootFallback || bootTimer) {
    art.stop();
  }
  interval = undefined;
  capabilityRetry = undefined;
  bootFallback = undefined;
  bootTimer = undefined;
  if (!started || !watcherEnabled()) {
    return;
  }
  bootUntil = Date.now() + BOOT_DELAY_MS;
  bootDone = false;
  interval = setInterval(tick, WATCHER_POLL_INTERVAL_MS);
  bootFallback = setTimeout(bootLaunch, BOOT_FALLBACK_MS);
  discoverCapability();
}
function controlHome(req: IncomingMessage, res: ServerResponse) {
  function reply(code: number, value: unknown) {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  }
  const headers = req.headers || {};
  if (req.method !== "POST") {
    reply(HTTP_STATUS.methodNotAllowed, { error: "POST required" });
    return;
  }
  if (headers.origin || headers["x-aerotizen-home"] !== LOCAL_CONTROL_MARKER) {
    reply(HTTP_STATUS.forbidden, { error: "Local native control required" });
    return;
  }
  if (headers["content-type"] !== "application/json") {
    reply(HTTP_STATUS.unsupportedMedia, { error: "JSON required" });
    return;
  }
  let body = "";
  let finished = false;
  if (req.setEncoding) {
    req.setEncoding("utf8");
  }
  req.on("data", function (chunk: string | Buffer) {
    if (finished) {
      return;
    }
    body += chunk.toString();
    if (body.length > MAX_MODE_REQUEST_CHARACTERS) {
      finished = true;
      reply(HTTP_STATUS.tooLarge, { error: "Request too large" });
    }
  });
  req.on("error", function () {
    if (!finished) {
      finished = true;
      reply(HTTP_STATUS.badRequest, { error: "Request failed" });
    }
  });
  req.on("end", function () {
    if (finished) {
      return;
    }
    finished = true;
    try {
      reply(HTTP_STATUS.ok, homeMode.change(JSON.parse(body)));
    } catch (e) {
      reply(HTTP_STATUS.conflict, { error: errorMessage(e), homeControl: homeMode.read() });
    }
  });
}
function diagnosticRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const headers = req.headers || {};
  function reply(code: number, data: unknown) {
    const responseHeaders: Record<string, string | string[]> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
    if (headers.origin === "null" || headers.origin === "file://") {
      responseHeaders["Access-Control-Allow-Origin"] = headers.origin;
    }
    res.writeHead(code, responseHeaders);
    res.end(JSON.stringify(data));
  }
  if (pathname === DIAGNOSTIC_PATHS.logs) {
    if (req.method !== "GET" || headers.origin || headers["x-aerotizen-diagnostics"] !== LOCAL_CONTROL_MARKER) {
      reply(HTTP_STATUS.forbidden, { error: "Developer connection required" });
      return;
    }
    reply(HTTP_STATUS.ok, diagnosticContext.enrich(diagnostics.snapshot(), homeMode.read(), state));
    return;
  }
  if (req.method !== "POST" || (headers.origin && headers.origin !== "null" && headers.origin !== "file://")) {
    reply(HTTP_STATUS.forbidden, { error: "Local launcher events required" });
    return;
  }
  let body = "";
  let finished = false;
  if (req.setEncoding) {
    req.setEncoding("utf8");
  }
  req.on("data", function (chunk: string | Buffer) {
    if (finished) {
      return;
    }
    body += chunk.toString();
    if (body.length > MAX_EVENT_BATCH_CHARACTERS) {
      finished = true;
      reply(HTTP_STATUS.tooLarge, { error: "Event batch too large" });
    }
  });
  req.on("error", function () {
    if (!finished) {
      finished = true;
      reply(HTTP_STATUS.badRequest, { error: "Event batch failed" });
    }
  });
  req.on("end", function () {
    if (finished) {
      return;
    }
    finished = true;
    try {
      const packet: unknown = JSON.parse(body);
      const events = eventBatch(packet);
      if (
        !Array.isArray(events) ||
        events.length > MAX_EVENT_BATCH_RECORDS ||
        events.some(function (item) {
          return object(item)?.source !== "ui";
        }) ||
        !diagnostics.ingest(events)
      ) {
        reply(HTTP_STATUS.badRequest, { error: "Invalid event batch" });
        return;
      }
      diagnosticContext.accept(packet);
      reply(HTTP_STATUS.ok, { schema_version: 1, accepted: events.length });
    } catch (e) {
      reply(HTTP_STATUS.badRequest, { error: "Invalid event batch" });
    }
  });
}
export const onStart = () => {
  if (started) {
    return;
  }
  started = true;
  diagnostics.record("service.start");
  setTimeout(function () {
    diagnosticContext.start();
  }, 0);
  try {
    require("./diagnostics-store")(typeof tizen !== "undefined" ? tizen : null, function (storage) {
      if (storage) {
        diagnostics.attach(storage);
      }
    });
  } catch (e) {
    /* optional log storage */
  }
  server = http.createServer(function (req, res) {
    const url = require("url").parse(req.url || "", true);
    const query = url.query;
    const pathname = url.pathname || "";
    if (pathname === DIAGNOSTIC_PATHS.logs || pathname === DIAGNOSTIC_PATHS.events) {
      diagnosticRequest(req, res, pathname);
      return;
    }
    if (["/home", "/leave", "/watch"].indexOf(pathname) >= 0) {
      diagnostics.record("service.request", { action: pathname.slice(1) });
    }
    if (pathname === HOME_CONTROL_PATH) {
      controlHome(req, res);
      return;
    }
    if (
      (pathname === "/watch" && query.id !== undefined && typeof query.id !== "string") ||
      (pathname === "/apps" && query.ids !== undefined && typeof query.ids !== "string")
    ) {
      res.writeHead(HTTP_STATUS.badRequest, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: "Invalid app identifiers" }));
      return;
    }
    if (
      pathname === "/startup" &&
      typeof query.data === "string" &&
      query.data.length <= MAX_STARTUP_TRACE_CHARACTERS
    ) {
      try {
        const trace = object(JSON.parse(query.data));
        if (
          trace &&
          typeof trace.script_at === "number" &&
          Array.isArray(trace.marks) &&
          trace.marks.length <= MAX_STARTUP_MARKS
        ) {
          state.startup = trace;
        }
      } catch (e) {
        /* Ignore malformed diagnostics. */
      }
    }
    if (pathname === "/watch" && watcherEnabled()) {
      invalidate("app launch requested");
      state.watched = typeof query.id === "string" ? query.id || null : null;
      state.seen = false;
      state.leaving = false;
      resetWatchedTiming();
      state.watchAt = Date.now();
    } else if (pathname === "/apps") {
      invalidate("app inventory changed");
      state.apps = (typeof query.ids === "string" ? query.ids : "").split(",").filter(Boolean);
      state.snapAt = 0; // re-read what is running before Home can be pressed
    } else if (pathname === "/leave") {
      invalidate("Samsung Home escape");
      state.leaving = true;
      resetTracking();
    } else if (pathname === "/home") {
      invalidate("launcher returned");
      state.leaving = false;
      resetTracking();
    }
    const response = Object.assign({}, state, { art: art.getState(), homeControl: homeMode.read() });
    res.writeHead(HTTP_STATUS.ok, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(response));
  });
  server.listen(WATCHER_PORT, LOOPBACK_HOST);
  require("./home-store")(typeof tizen !== "undefined" ? tizen : null, function (storage, failed) {
    if (stopped) {
      return;
    }
    homeMode = createHomeMode(storage, updateMode, failed);
    updateMode();
  });
};
export const onRequest = () => {};
export const onExit = () => {
  diagnostics.record("service.exit");
  diagnostics.flushStorage();
  stopped = true;
  invalidate("service exit");
  scanNumber += 1;
  clearInterval(interval);
  clearTimeout(capabilityRetry);
  clearTimeout(bootFallback);
  clearTimeout(bootTimer);
  art.stop();
  if (server) {
    server.close();
    server = null;
  }
};
