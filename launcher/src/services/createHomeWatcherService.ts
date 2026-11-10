import type { AppFailure } from "../contracts/apps";
import type { HomeWatcherPlatform, HomeWatcherReply, HomeWatcherService } from "../contracts/homeWatcher";
import { HOME_WATCHER_PATHS as PATHS } from "../contracts/homeWatcher";
import type { AppCatalog } from "../shared/apps/appCatalog";

const REQUEST_TIMEOUT_MS = 1_500;
const READINESS_REQUEST_TIMEOUT_MS = 750;
const READINESS_RETRY_DELAY_MS = 200;
const APPCONTROL_FALLBACK_DELAY_MS = 1_500;
// A Tizen 10 QN80H cold boot needed about 18 seconds before its first HTTP reply.
const SERVICE_START_TIMEOUT_MS = 30_000;
const APPCONTROL_FALLBACK_PLATFORM = 9;
const WRT_FIRST_PLATFORM = 10;
const HOME_CONTROL_PROTOCOL = 1;
const INVENTORY_QUERY = PATHS.apps + "?ids=";
const HANDOFF_PATH = /^\/(home|leave|watch)(\?|$)/;
const START_METHODS = { appControl: "app_control", wrt: "wrt_service" } as const;

interface StartupWaiter {
  readonly done?: () => void;
  readonly failed?: AppFailure;
}

interface StartupAttempt {
  cancel(): void;
  readonly waiters: StartupWaiter[];
}

interface Dependencies {
  appId: string;
  catalog: Pick<AppCatalog, "preloadedStoreId">;
  now(): number;
  platform: HomeWatcherPlatform;
  timers: Pick<Window, "clearTimeout" | "setTimeout">;
}

const readyFor = (value: HomeWatcherReply, appId: string) => {
  const control = value.homeControl;
  return (
    !!control &&
    typeof control === "object" &&
    "protocol" in control &&
    "app_id" in control &&
    control.protocol === HOME_CONTROL_PROTOCOL &&
    control.app_id === appId &&
    typeof value.heartbeats === "number"
  );
};
const cancelled = (error: unknown) =>
  !!error && typeof error === "object" && "cancelled" in error && error.cancelled === true;

export const createHomeWatcherService = ({
  appId,
  catalog,
  now,
  platform,
  timers,
}: Dependencies): HomeWatcherService => {
  let disposed = false;
  let leaving = false;
  let starting: StartupAttempt | undefined;
  let inventory: string | null = null;
  let transition = 0;
  let homeRequest = 0;
  const requests = new Set<() => void>();

  const request = (
    path: string,
    done: (value: HomeWatcherReply) => void,
    failed: () => void,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ) => {
    let active = true;
    let release = () => {};
    const cancel = () => {
      active = false;
      requests.delete(cancel);
      release();
    };
    requests.add(cancel);
    const finish = (callback: () => void) => {
      if (!disposed && active) {
        active = false;
        requests.delete(cancel);
        callback();
      }
    };
    release = platform.request(
      path,
      timeoutMs,
      (value) => finish(() => done(value)),
      () => finish(failed),
    );
    if (!active || disposed) {
      release();
    }
    return cancel;
  };

  const start = (done?: () => void, failed?: AppFailure) => {
    if (disposed) {
      return;
    }
    if (!platform.available) {
      failed?.();
      return;
    }
    if (starting) {
      starting.waiters.push({ done, failed });
      return;
    }
    let launched = false;
    let method: (typeof START_METHODS)[keyof typeof START_METHODS] | null = null;
    let reason: string | undefined;
    let retryTimer: number | undefined;
    let cancelProbe: (() => void) | undefined;
    let cancelModule: (() => void) | undefined;
    let platformVersion = 0;
    let appControlSince = 0;
    const since = now();
    const attempt: StartupAttempt = {
      waiters: [{ done, failed }],
      cancel() {
        timers.clearTimeout(deadline);
        timers.clearTimeout(retryTimer);
        cancelModule?.();
        cancelProbe?.();
      },
    };
    starting = attempt;
    const active = () => !disposed && starting === attempt;
    const finish = (ready: boolean, failure?: string) => {
      if (!active()) {
        return;
      }
      starting = undefined;
      attempt.cancel();
      platform.record(ready ? "service.ready" : "service.start_failed", {
        method,
        duration_ms: now() - since,
        reason: failure,
      });
      for (const waiter of attempt.waiters) {
        if (disposed) {
          break;
        }
        (ready ? waiter.done : waiter.failed)?.();
      }
    };
    const retry = () => {
      if (active()) {
        retryTimer = timers.setTimeout(poll, READINESS_RETRY_DELAY_MS);
      }
    };
    const probe = (path: string, done: (value: HomeWatcherReply) => void, failed: () => void) => {
      let settled = false;
      const cancel = request(
        path,
        (value) => {
          settled = true;
          done(value);
        },
        () => {
          settled = true;
          failed();
        },
        READINESS_REQUEST_TIMEOUT_MS,
      );
      // An immediate transport failure can start another probe before this call returns.
      if (!active()) {
        cancel();
      } else if (!settled) {
        cancelProbe = cancel;
      }
    };
    const syncInventory = () => {
      const path = inventory;
      if (path === null) {
        return;
      }
      probe(
        path,
        () => {
          if (active()) {
            if (inventory !== path) {
              syncInventory();
            } else {
              finish(true);
            }
          }
        },
        retry,
      );
    };
    const accepted = (startMethod: (typeof START_METHODS)[keyof typeof START_METHODS]) => () => {
      if (active()) {
        platform.record("service.launch_accepted", { method: startMethod });
      }
    };
    const rejected = () => {
      if (active()) {
        reason = "service_start_rejected";
      }
    };
    const startWrt = () => {
      method = START_METHODS.wrt;
      reason = undefined;
      platform.record("service.launch_requested", { method });
      const cancel = platform.loadServiceModule(
        () => {
          if (active()) {
            platform.startWrtService(accepted(START_METHODS.wrt), rejected);
            // A launch acknowledgement is not readiness; the service may already run.
            poll();
          }
        },
        () => finish(false, "service_module_failed"),
      );
      cancelModule = cancel;
      if (!active()) {
        cancel();
      }
    };
    const launch = () => {
      launched = true;
      platformVersion = platform.platformVersion();
      if (platformVersion >= WRT_FIRST_PLATFORM) {
        startWrt();
        return;
      }
      method = START_METHODS.appControl;
      appControlSince = now();
      platform.record("service.launch_requested", { method });
      platform.startAppControl(accepted(START_METHODS.appControl), rejected);
      poll();
    };
    const unavailable = () => {
      if (!active()) {
        return;
      }
      if (!launched) {
        launch();
      } else if (
        platformVersion >= APPCONTROL_FALLBACK_PLATFORM &&
        method === START_METHODS.appControl &&
        now() - appControlSince >= APPCONTROL_FALLBACK_DELAY_MS
      ) {
        startWrt();
      } else {
        retry();
      }
    };
    function poll() {
      if (!active()) {
        return;
      }
      probe(
        PATHS.status,
        (value) => {
          if (!active()) {
            return;
          }
          if (!readyFor(value, appId)) {
            unavailable();
            return;
          }
          if (inventory !== null) {
            syncInventory();
          } else {
            finish(true);
          }
        },
        unavailable,
      );
    }
    const deadline = timers.setTimeout(
      () => finish(false, reason || "service_start_timeout"),
      SERVICE_START_TIMEOUT_MS,
    );
    poll();
  };

  const tell = (
    path: string,
    done?: (value: HomeWatcherReply) => void,
    failed?: AppFailure,
    recover = true,
    version?: number,
  ) => {
    if (disposed || !platform.available || (path.startsWith(INVENTORY_QUERY) && path !== inventory)) {
      return;
    }
    const commandVersion = version ?? (HANDOFF_PATH.test(path) ? ++transition : undefined);
    const superseded = () => {
      if (commandVersion === undefined || commandVersion === transition) {
        return false;
      }
      failed?.({ name: "AbortError", cancelled: true });
      return true;
    };
    request(
      path,
      (value) => {
        if (!superseded()) {
          platform.flushDiagnostics();
          done?.(value);
        }
      },
      () => {
        if (superseded()) {
          return;
        }
        platform.record("service.unavailable", { action: path.split("?")[0], error: "RequestFailed" });
        if (recover) {
          start(
            () => {
              if (!superseded()) {
                tell(path, done, failed, false, commandVersion);
              }
            },
            () => {
              if (!superseded()) {
                failed?.();
              }
            },
          );
        } else {
          failed?.();
        }
      },
    );
  };
  const unwatch = platform.subscribeVisibility(() => {
    if (!disposed && !platform.isHidden()) {
      leaving = false;
      tell(PATHS.home);
    }
  });
  return {
    start,
    request: tell,
    watch(id, done, failed) {
      const storeId = catalog.preloadedStoreId(id) || id;
      tell(
        PATHS.watch + "?id=" + encodeURIComponent(storeId),
        (value) => {
          if (done) {
            if (value.watched === storeId) {
              done();
            } else {
              failed?.();
            }
          }
        },
        failed,
      );
    },
    reportApps(ids) {
      if (!disposed) {
        inventory = INVENTORY_QUERY + ids.map(encodeURIComponent).join(",");
        tell(inventory);
      }
    },
    reportStartup(trace) {
      if (!disposed) {
        tell(PATHS.startup + "?data=" + encodeURIComponent(JSON.stringify(trace)), undefined, () => {}, false);
      }
    },
    useSamsungHome() {
      if (disposed) {
        return;
      }
      if (!platform.available) {
        platform.notify("handoff.wouldOpenHome");
        return;
      }
      leaving = true;
      const request = ++homeRequest;
      const failed = (error?: unknown) => {
        if (disposed || request !== homeRequest) {
          return;
        }
        leaving = false;
        if (!cancelled(error)) {
          platform.notify("handoff.homeTryAgain");
        }
      };
      tell(
        PATHS.leave,
        (value) => {
          if (value.leaving !== true) {
            failed();
            return;
          }
          platform.openSamsungHome(() => {
            if (!disposed) {
              tell(PATHS.home);
              failed();
            }
          });
        },
        failed,
      );
    },
    isLeaving: () => leaving,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      leaving = false;
      transition++;
      homeRequest++;
      starting?.cancel();
      starting = undefined;
      [...requests].forEach((cancel) => cancel());
      requests.clear();
      unwatch();
    },
  };
};
