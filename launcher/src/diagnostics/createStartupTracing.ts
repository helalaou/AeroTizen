import type { LauncherStartup, StartupLaunch, StartupTrace } from "../contracts/diagnostics";

const STORAGE_KEY = "aerotizen.startup.v1";
const MAX_MARKS = 32;
const MAX_OPERATION_CHARACTERS = 96;
const MAX_ROUTING_VALUE_CHARACTERS = 48;
const MAX_ERROR_NAME_CHARACTERS = 32;
const ROUTING_KEYS = ["entry_point", "__K_BG_LAUNCH", "init", "SkipReload"];

interface StartupHost {
  addEventListener(type: string, listener: () => void): void;
  document: Pick<Document, "readyState" | "hidden" | "addEventListener"> & { hasFocus?(): boolean };
  localStorage: Pick<Storage, "setItem">;
  performance?: Pick<Performance, "now" | "timing">;
  setTimeout(callback: () => void, delayMs: number): number;
  tizen?: {
    application?: {
      getCurrentApplication?(): {
        getRequestedAppControl(): {
          appControl?: { operation?: string; data?: readonly { key: string; value?: readonly unknown[] }[] };
        } | null;
      };
    };
  };
}

export const createStartupTracing = (host: StartupHost): LauncherStartup => {
  const started = Date.now();
  const performance = host.performance;
  const tick = performance?.now ? performance.now() : null;
  let loaded = host.document.readyState === "complete";
  let pending: (() => void)[] = [];
  const trace: StartupTrace = {
    script_at: started,
    navigation_at: performance?.timing?.navigationStart ?? null,
    marks: [],
  };
  const mark = (name: string) => {
    const elapsed = tick === null || !performance ? Date.now() - started : Math.round(performance.now() - tick);
    if (trace.marks.length < MAX_MARKS) {
      trace.marks.push({
        name,
        ms: elapsed,
        hidden: host.document.hidden,
        focused: host.document.hasFocus ? host.document.hasFocus() : null,
      });
    }
    try {
      host.localStorage.setItem(STORAGE_KEY, JSON.stringify(trace));
    } catch {
      /* optional diagnostics */
    }
  };
  const captureLaunch = (event: string) => {
    const api = host.tizen?.application;
    const launch: StartupLaunch = {};
    try {
      if (api?.getCurrentApplication) {
        const control = api.getCurrentApplication().getRequestedAppControl()?.appControl;
        if (control) {
          launch.operation = String(control.operation || "").slice(0, MAX_OPERATION_CHARACTERS);
          launch.data = {};
          for (const item of control.data || []) {
            if (ROUTING_KEYS.indexOf(item.key) >= 0 && item.value?.length) {
              launch.data[item.key] = String(item.value[0]).slice(0, MAX_ROUTING_VALUE_CHARACTERS);
            }
          }
        }
      }
    } catch (error) {
      const name =
        error && typeof error === "object" && "name" in error && typeof error.name === "string"
          ? error.name
          : "unavailable";
      launch.error = (name || "unavailable").slice(0, MAX_ERROR_NAME_CHARACTERS);
    }
    if (!trace.launch) {
      trace.launch = launch;
    } else {
      trace.last_launch = launch;
    }
    mark(event);
  };
  mark("first-script");
  host.document.addEventListener("DOMContentLoaded", () => mark("dom-ready"));
  host.addEventListener("load", () => {
    mark("page-loaded");
    loaded = true;
    pending.forEach((callback) => host.setTimeout(callback, 0));
    pending = [];
  });
  host.document.addEventListener("visibilitychange", () => mark(host.document.hidden ? "hidden" : "visible"));
  host.addEventListener("focus", () => mark("focus"));
  host.addEventListener("blur", () => mark("blur"));
  host.addEventListener("appcontrol", () => captureLaunch("appcontrol"));
  return {
    trace,
    mark,
    captureLaunch: () => captureLaunch("launch-request"),
    afterLoad(callback) {
      if (loaded) {
        host.setTimeout(callback, 0);
      } else {
        pending.push(callback);
      }
    },
  };
};
