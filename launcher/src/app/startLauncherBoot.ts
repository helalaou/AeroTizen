import type { LauncherRuntime, LauncherStartup } from "../platform/tizen/launcherRuntime";

type BootRuntime = Pick<
  LauncherRuntime,
  | "applyBackground"
  | "apps"
  | "clock"
  | "continueWatching"
  | "homeScreen"
  | "homewatch"
  | "inputs"
  | "network"
  | "settings"
  | "tizen"
  | "weather"
>;
type BootHost = Pick<
  Window,
  | "addEventListener"
  | "cancelAnimationFrame"
  | "clearTimeout"
  | "document"
  | "removeEventListener"
  | "requestAnimationFrame"
  | "setTimeout"
>;

const APP_REPORT_DEBOUNCE_MS = 1500;
const STARTUP_REPORT_DELAY_MS = 1500;

export const startLauncherBoot = (host: BootHost, runtime: BootRuntime, startup: LauncherStartup) => {
  const { document } = host;
  const { apps, clock, continueWatching, homewatch, inputs, network, settings, weather } = runtime;
  let disposed = false;
  let discoveryStarted = false;
  let refreshTimer: number | undefined;
  let appReportTimer: number | undefined;
  let startupReportTimer: number | undefined;
  let frame: number | undefined;
  let unsubscribeApps: (() => void) | undefined;
  let reportedAppIds: string | undefined;

  const refreshAppsOnReturn = () => {
    if (!discoveryStarted || !runtime.tizen || document.hidden || refreshTimer !== undefined) {
      return;
    }
    // An existing launcher can receive both events when it comes to the front.
    refreshTimer = host.setTimeout(() => {
      refreshTimer = undefined;
      if (!document.hidden) {
        apps.load();
      }
    }, 0);
  };
  const onVisibility = () => {
    if (!document.hidden) {
      clock.tick();
      refreshAppsOnReturn();
    }
  };
  const onInventory = () => {
    if (!settings.getSnapshot().homeInitialized) {
      settings.update({ home: apps.defaultHome() });
    }
    const nextIds = [...apps.getSnapshot().realIds].sort().join(",");
    if (nextIds !== reportedAppIds) {
      reportedAppIds = nextIds;
      host.clearTimeout(appReportTimer);
      appReportTimer = host.setTimeout(() => {
        homewatch.reportApps(apps.getSnapshot().realIds);
      }, APP_REPORT_DEBOUNCE_MS);
    }
  };
  const discover = () => {
    if (disposed) {
      return;
    }
    startup.captureLaunch();
    continueWatching.start();
    network.start();
    weather.start();
    inputs.start();
    homewatch.start();
    startupReportTimer = host.setTimeout(() => {
      homewatch.reportStartup(startup.trace);
    }, STARTUP_REPORT_DELAY_MS);
    startup.mark("apps-requested");
    unsubscribeApps = apps.subscribe(onInventory);
    discoveryStarted = true;
    apps.load((success) => {
      if (disposed) {
        return;
      }
      startup.mark(success ? "apps-loaded" : "apps-unavailable");
      if (success) {
        // The first discovery can finish after the Home view is replaced by hot reload.
        runtime.homeScreen?.refreshApps();
      }
      homewatch.reportStartup(startup.trace);
    });
    startup.mark("apps-call-returned");
  };
  const dispose = () => {
    disposed = true;
    host.removeEventListener("appcontrol", refreshAppsOnReturn);
    document.removeEventListener("visibilitychange", onVisibility);
    if (frame !== undefined) {
      host.cancelAnimationFrame(frame);
    }
    host.clearTimeout(refreshTimer);
    host.clearTimeout(appReportTimer);
    host.clearTimeout(startupReportTimer);
    unsubscribeApps?.();
  };

  host.addEventListener("appcontrol", refreshAppsOnReturn);
  document.addEventListener("visibilitychange", onVisibility);
  try {
    startup.mark("settings-loaded");
    runtime.applyBackground();
    clock.start();
    apps.restore();
    runtime.homeScreen?.render();
    startup.mark("home-rendered");
    // Let the first frame draw before crossing into the TV package APIs.
    frame = host.requestAnimationFrame(() => {
      frame = host.requestAnimationFrame(() => {
        frame = undefined;
        startup.mark("frame-ready");
        startup.afterLoad(discover);
      });
    });
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
};
