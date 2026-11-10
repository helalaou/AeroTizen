import type { AppFailure } from "../../contracts/apps";
import type { NativeNavigation, NativeWatcher } from "../../contracts/nativeNavigation";
import type { Translate } from "../../shared/i18n/createTranslations";

import type { ReadonlyTizenFilesystem } from "./readonlyFilesystem";

const SAMSUNG_HOME_APP_ID = "com.samsung.tv.csfs";
const TV_VIEWER_APP_ID = "org.tizen.tv-viewer";
const MAIN_OPERATION = "http://tizen.org/appcontrol/operation/main";
const MAIN_VIDEO_WINDOW = "MAIN";
const ROUTING_FILE = "wgt-private/aerotizen-home-routing-v1.json";
const MAX_ROUTING_BYTES = 4_096;
const ROUTING_READ_TIMEOUT_MS = 500;
const WATCHER_REQUEST_TIMEOUT_MS = 1_500;
const VIEWER_FOCUS_CHECK_MS = 2_100;
const TRANSACTION_PATTERN = /^[a-f0-9]{32}$/;
const BASELINE_HASH_PATTERN = /^[a-f0-9]{64}$/;
const WATCHER_PATHS = { home: "/home", leave: "/leave" } as const;
const HTTP_SUCCESS = { minimum: 200, maximumExclusive: 300 } as const;
const WATCHER_FAILURES = {
  setup: { reason: "HomeWatcher request failed", message: "handoff.watcherRequestFailed" },
  network: { reason: "HomeWatcher unavailable", message: "handoff.watcherUnavailable" },
} as const;
const SOURCE_SELECTION_FAILURE = "source selection failed";
const ACTIONS = { home: "samsung_home", tv: "live_tv", hdmi: "hdmi" } as const;
const EVENTS = {
  request: "handoff.request",
  accepted: "handoff.accepted",
  failed: "handoff.failed",
  visibilityUnconfirmed: "handoff.visibility_unconfirmed",
} as const;

type WatcherRequest = Pick<
  XMLHttpRequest,
  "abort" | "onabort" | "onerror" | "onload" | "ontimeout" | "open" | "send" | "status" | "timeout"
>;
type HandoffAction = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface NativeNavigationTizen {
  application?: {
    launch?(id: string, ready: () => void, failed: (error?: unknown) => void): void;
    launchAppControl?(control: unknown, id: string, ready: () => void, failed: (error?: unknown) => void): void;
  };
  ApplicationControl?: new (operation: string) => unknown;
  filesystem?: ReadonlyTizenFilesystem;
  tvwindow?: {
    setSource?(source: unknown, ready: () => void, failed: (error?: unknown) => void, target: string): void;
  };
}

interface NativeHost {
  addEventListener?(type: "load", listener: () => void): void;
  AeroDiagnostics?: {
    flush?(): void;
    record(event: string, data: Record<string, unknown>): string | null;
  };
  AeroTizen: {
    config: { SERVICE_URL: string };
    homewatch: NativeWatcher;
    tizen?: NativeNavigationTizen | null;
    toast(message: string): void;
    translate: Translate;
  };
  clearTimeout(id: number): void;
  document: Pick<Document, "addEventListener" | "hidden" | "removeEventListener">;
  removeEventListener?(type: "load", listener: () => void): void;
  setTimeout(callback: () => void, delay: number): number;
  XMLHttpRequest: new () => WatcherRequest;
}

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : null;
const cancelled = (value: unknown) => record(value)?.cancelled === true;
const errorName = (value: unknown) => {
  const name = record(value)?.name;
  return typeof name === "string" ? name : undefined;
};
const errorText = (value: unknown) => {
  const error = record(value);
  if (typeof error?.name === "string" && error.name) {
    return error.name;
  }
  return typeof error?.message === "string" ? error.message : "";
};
const failureText = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? value : errorText(value);
const nativeRouting = (value: unknown) => {
  const routing = record(value);
  return (
    !!routing &&
    routing.mode === "native" &&
    typeof routing.transaction === "string" &&
    TRANSACTION_PATTERN.test(routing.transaction) &&
    typeof routing.baseline_sha256 === "string" &&
    BASELINE_HASH_PATTERN.test(routing.baseline_sha256)
  );
};

export const createNativeNavigation = (host: NativeHost): NativeNavigation => {
  const runtime = host.AeroTizen;
  const tizen = runtime.tizen;
  const document = host.document;
  const pending = new Set<() => void>();
  let disposed = false;
  let started = false;
  let homePending = false;
  let viewerPending = false;
  let viewerRequest = 0;

  // Each local operation has one settlement and one cleanup, including disposal.
  const own = (release: (aborted: boolean) => void = () => {}) => {
    let active = true;
    const finish = (aborted: boolean, action?: () => void) => {
      if (!active) {
        return;
      }
      active = false;
      pending.delete(cancel);
      release(aborted);
      if (!disposed) {
        action?.();
      }
    };
    const cancel = () => finish(true);
    pending.add(cancel);
    return { cancel, active: () => active && !disposed, finish: (action?: () => void) => finish(false, action) };
  };
  const report = (
    stage: keyof typeof EVENTS,
    action: HandoffAction,
    operation?: string | null,
    reason?: unknown,
    error?: string,
  ) => {
    const log = host.AeroDiagnostics;
    if (disposed || !log) {
      return null;
    }
    const id = log.record(EVENTS[stage], {
      action,
      operation_id: operation,
      ...(reason ? { reason } : {}),
      ...(error ? { error } : {}),
    });
    if (stage !== "request") {
      log.flush?.();
    }
    return id;
  };
  const requestWatcher = (
    path: string,
    done?: (status: number) => void,
    failed?: (stage: "setup" | "network") => void,
  ) => {
    let xhr: WatcherRequest;
    try {
      xhr = new host.XMLHttpRequest();
    } catch {
      failed?.("setup");
      return;
    }
    const task = own((aborted) => {
      if (aborted) {
        try {
          xhr.abort();
        } catch {
          /* Other local work must still be released. */
        }
      }
    });
    xhr.onload = () => task.finish(() => done?.(xhr.status));
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => task.finish(() => failed?.("network"));
    try {
      xhr.open("GET", runtime.config.SERVICE_URL + path, true);
      xhr.timeout = WATCHER_REQUEST_TIMEOUT_MS;
      xhr.send();
    } catch {
      task.finish(() => failed?.("setup"));
    }
  };
  const rearmWatcher = () => {
    if (disposed || !tizen) {
      return;
    }
    if (runtime.homewatch.request) {
      runtime.homewatch.request(WATCHER_PATHS.home);
      return;
    }
    requestWatcher(WATCHER_PATHS.home);
  };
  const readNativeHome = (done: (confirmed: boolean) => void) => {
    const filesystem = tizen?.filesystem;
    if (!filesystem) {
      done(false);
      return;
    }
    const task = own(() => host.clearTimeout(timer));
    const finish = (confirmed: boolean) => task.finish(() => done(confirmed));
    const timer = host.setTimeout(() => finish(false), ROUTING_READ_TIMEOUT_MS);
    try {
      filesystem.resolve(
        ROUTING_FILE,
        (file) => {
          if (!task.active()) {
            return;
          }
          try {
            if (!(file.fileSize > 0 && file.fileSize <= MAX_ROUTING_BYTES)) {
              finish(false);
              return;
            }
            file.readAsText(
              (text) => {
                if (!task.active()) {
                  return;
                }
                let confirmed = false;
                try {
                  confirmed = nativeRouting(JSON.parse(text) as unknown);
                } catch {
                  /* Invalid routing keeps watcher protection. */
                }
                finish(confirmed);
              },
              () => finish(false),
              "UTF-8",
            );
          } catch {
            finish(false);
          }
        },
        () => finish(false),
        "r",
      );
    } catch {
      finish(false);
    }
  };
  const watcherFailed = (stage: keyof typeof WATCHER_FAILURES, failed: AppFailure) => {
    const failure = WATCHER_FAILURES[stage];
    failed(failure.reason, runtime.translate(failure.message));
  };
  const requestLeave = (ready: () => void, failed: AppFailure) => {
    if (runtime.homewatch.request) {
      const task = own();
      runtime.homewatch.request(
        WATCHER_PATHS.leave,
        (status) =>
          task.finish(() => {
            if (record(status)?.leaving !== true) {
              watcherFailed("setup", failed);
            } else {
              ready();
            }
          }),
        (error) =>
          task.finish(() => {
            if (cancelled(error)) {
              failed(error);
            } else {
              watcherFailed("network", failed);
            }
          }),
      );
      return;
    }
    requestWatcher(
      WATCHER_PATHS.leave,
      (status) => {
        if (status < HTTP_SUCCESS.minimum || status >= HTTP_SUCCESS.maximumExclusive) {
          failed("HomeWatcher HTTP " + status, runtime.translate("handoff.watcherHttp", { status }));
        } else {
          ready();
        }
      },
      (stage) => watcherFailed(stage, failed),
    );
  };
  const leaveBeforeLaunch = (ready: () => void, failed: AppFailure) => {
    if (disposed) {
      return;
    }
    readNativeHome((confirmed) => {
      if (confirmed) {
        ready();
      } else {
        requestLeave(ready, failed);
      }
    });
  };
  const launchNativeApp = (appId: string, accepted: () => void, failed: AppFailure, active: () => boolean) => {
    const fallback = () => {
      if (!active()) {
        return;
      }
      const application = tizen?.application;
      if (!tizen?.ApplicationControl || !application?.launchAppControl) {
        failed("AppControl is unavailable", runtime.translate("handoff.appControlUnavailable"));
        return;
      }
      try {
        application.launchAppControl(new tizen.ApplicationControl(MAIN_OPERATION), appId, accepted, (error) => {
          const reason = errorText(error);
          failed(reason || "launch denied", reason || runtime.translate("handoff.launchDenied"));
        });
      } catch (error) {
        const reason = errorText(error);
        failed(reason || "AppControl failed", reason || runtime.translate("handoff.appControlFailed"));
      }
    };
    if (!active()) {
      return;
    }
    const application = tizen?.application;
    if (!application?.launch) {
      fallback();
      return;
    }
    try {
      application.launch(appId, accepted, fallback);
    } catch {
      fallback();
    }
  };
  return {
    commands: {
      resume: rearmWatcher,
      suspendForExternal: leaveBeforeLaunch,
      prepareAppLaunch(appId, ready, failed) {
        if (disposed) {
          return;
        }
        readNativeHome((confirmed) => {
          if (confirmed) {
            ready();
            return;
          }
          const task = own();
          runtime.homewatch.watch(
            appId,
            () => task.finish(ready),
            (reason, detail, error) => task.finish(() => failed(reason, detail, error)),
          );
        });
      },
      openSamsungHome() {
        if (disposed || homePending) {
          return;
        }
        if (!tizen?.application || !tizen.ApplicationControl) {
          runtime.toast(runtime.translate("handoff.homeUnavailable"));
          return;
        }
        const operation = report("request", ACTIONS.home);
        homePending = true;
        const task = own();
        const failed: AppFailure = (reason, detail) =>
          task.finish(() => {
            homePending = false;
            if (cancelled(reason)) {
              return;
            }
            report("failed", ACTIONS.home, operation, reason);
            rearmWatcher();
            runtime.toast(runtime.translate("handoff.homeFailed", { reason: detail || failureText(reason) }));
          });
        const accepted = () =>
          task.finish(() => {
            homePending = false;
            report("accepted", ACTIONS.home, operation);
          });
        leaveBeforeLaunch(() => launchNativeApp(SAMSUNG_HOME_APP_ID, accepted, failed, task.active), failed);
      },
      openNativeViewer(source, hdmi) {
        if (disposed) {
          return false;
        }
        if (viewerPending) {
          return true;
        }
        if (!tizen?.application?.launch) {
          return false;
        }
        const canSelectSource = !!source && typeof tizen.tvwindow?.setSource === "function";
        if (hdmi && !canSelectSource) {
          return false;
        }
        const action = hdmi ? ACTIONS.hdmi : ACTIONS.tv;
        const operation = report("request", action);
        const request = ++viewerRequest;
        viewerPending = true;
        let finished = false;
        let viewerWasHidden = false;
        let focusTimer: number | undefined;
        const visibilityChanged = () => {
          if (document.hidden) {
            viewerWasHidden = true;
            focus.cancel();
          }
        };
        const focus = own(() => {
          document.removeEventListener("visibilitychange", visibilityChanged);
          if (focusTimer !== undefined) {
            host.clearTimeout(focusTimer);
          }
        });
        const active = () => !disposed && !finished;
        const failed: AppFailure = (reason, detail, error) => {
          if (!active()) {
            return;
          }
          finished = true;
          viewerPending = false;
          focus.cancel();
          if (cancelled(reason)) {
            return;
          }
          report("failed", action, operation, reason, typeof error === "string" ? error : undefined);
          rearmWatcher();
          if (hdmi) {
            hdmi.fallback();
          } else {
            runtime.toast(runtime.translate("handoff.liveTvFailed", { reason: detail || failureText(reason) }));
          }
        };
        const accepted = () => {
          if (!active()) {
            return;
          }
          finished = true;
          viewerPending = false;
          report("accepted", action, operation);
          if (viewerWasHidden || document.hidden) {
            focus.cancel();
            return;
          }
          focusTimer = host.setTimeout(() => {
            focusTimer = undefined;
            focus.finish(() => {
              if (request !== viewerRequest || viewerWasHidden || document.hidden) {
                return;
              }
              report("visibilityUnconfirmed", action, operation);
              rearmWatcher();
              runtime.toast(
                hdmi
                  ? runtime.translate("handoff.inputNoFocus", { input: hdmi.label })
                  : runtime.translate("handoff.liveTvNoFocus"),
              );
            });
          }, VIEWER_FOCUS_CHECK_MS);
        };
        const launch = () => {
          if (!active()) {
            return;
          }
          document.addEventListener("visibilitychange", visibilityChanged);
          launchNativeApp(TV_VIEWER_APP_ID, accepted, failed, active);
        };
        leaveBeforeLaunch(() => {
          if (!active()) {
            return;
          }
          if (!canSelectSource) {
            launch();
            return;
          }
          try {
            tizen.tvwindow?.setSource?.(
              source,
              launch,
              (error) => {
                const reason = errorText(error);
                failed(
                  SOURCE_SELECTION_FAILURE,
                  runtime.translate("handoff.tunerFailed", {
                    reason: reason || runtime.translate("handoff.sourceError"),
                  }),
                  errorName(error),
                );
              },
              MAIN_VIDEO_WINDOW,
            );
          } catch (error) {
            failed(SOURCE_SELECTION_FAILURE, runtime.translate("handoff.tunerUnavailable"), errorName(error));
          }
        }, failed);
        return true;
      },
    },
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      host.addEventListener?.("load", rearmWatcher);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      homePending = false;
      viewerPending = false;
      viewerRequest++;
      if (started) {
        host.removeEventListener?.("load", rearmWatcher);
      }
      [...pending].forEach((cancel) => cancel());
      pending.clear();
    },
  };
};
