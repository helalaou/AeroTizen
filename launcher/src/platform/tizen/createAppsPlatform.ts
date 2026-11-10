import type { AppHandoff, AppsConfig, AppsPlatform } from "../../contracts/apps";
import type { InstalledApp } from "../../contracts/launcher";
import { shortAppName } from "../../shared/apps/appNames";
import type { Translate } from "../../shared/i18n/createTranslations";

export interface AppsTizen {
  application?: {
    getAppMetaData?(id: string): unknown;
    getAppsInfo(done: (records: unknown) => void, failed: () => void): void;
    launch(id: string, done: (() => void) | null, failed: (error?: unknown) => void): void;
    launchAppControl(control: unknown, id: string, done: (() => void) | null, failed: (error?: unknown) => void): void;
  };
  ApplicationControl?: new (operation: string, uri?: null, mime?: null, category?: null, data?: unknown[]) => unknown;
  ApplicationControlData?: new (key: string, values: string[]) => unknown;
  systeminfo?: { getCapability(key: string): string };
}

interface AppsHost {
  AeroDiagnostics?: {
    captureError(event: string, error: unknown, data: Record<string, unknown>): void;
    flush?(): void;
    record(event: string, data: Record<string, unknown>): string | null;
  };
  AeroTizen: {
    config: AppsConfig;
    homewatch: AppHandoff;
    tizen?: AppsTizen | null;
    toast(message: string): void;
    translate: Translate;
  };
  Fireplace?: { open(): void };
}

const cancelled = (error: unknown) =>
  !!error && typeof error === "object" && "cancelled" in error && error.cancelled === true;

export const createAppsPlatform = (host: AppsHost): AppsPlatform => {
  const runtime = host.AeroTizen;
  const config = runtime.config;
  const tizen = runtime.tizen;
  const application = tizen?.application;
  let disposed = false;
  let handoffPending = false;
  const openFireplace = () => host.Fireplace?.open();
  const notify: Translate = (key, values) => {
    const message = runtime.translate(key, values);
    runtime.toast(message);
    return message;
  };
  const prepareWatch = (id: string, ready: () => void, failed: (error?: unknown) => void) => {
    if (disposed) {
      return;
    }
    if (!runtime.homewatch.prepareAppLaunch) {
      runtime.homewatch.watch(id);
      ready();
      return;
    }
    if (handoffPending) {
      return;
    }
    handoffPending = true;
    runtime.homewatch.prepareAppLaunch(
      id,
      () => {
        handoffPending = false;
        if (!disposed) {
          ready();
        }
      },
      (error) => {
        handoffPending = false;
        if (!disposed && !cancelled(error)) {
          failed(error);
        }
      },
    );
  };
  const hbbtvLink = (id: string) => {
    try {
      const metadata = application?.getAppMetaData?.(id);
      if (Array.isArray(metadata)) {
        for (const value of metadata as unknown[]) {
          if (
            value &&
            typeof value === "object" &&
            "key" in value &&
            "value" in value &&
            value.key === config.HBBTV_LINK_METADATA &&
            typeof value.value === "string" &&
            value.value.trim()
          ) {
            return value.value;
          }
        }
      }
    } catch {
      // Older TVs may deny metadata reads for another app.
    }
    return "";
  };
  const reportsYouTubeVisibility = () => {
    try {
      return parseFloat(tizen?.systeminfo?.getCapability("http://tizen.org/feature/platform.version") || "") >= 10;
    } catch {
      return false;
    }
  };
  const control = (operation: string, data: readonly { key: string; values: readonly string[] }[]) => {
    if (!tizen?.ApplicationControl || !tizen.ApplicationControlData) {
      throw new Error("AppControl is unavailable");
    }
    const Data = tizen.ApplicationControlData;
    return new tizen.ApplicationControl(
      operation,
      null,
      null,
      null,
      data.map((entry) => new Data(entry.key, [...entry.values])),
    );
  };
  return {
    preview: !application,
    readInstalled(done) {
      if (disposed) {
        return () => {};
      }
      let active = true;
      const finish = (records: unknown) => {
        if (active && !disposed) {
          active = false;
          done(records);
        }
      };
      try {
        application?.getAppsInfo(finish, () => finish(null));
      } catch {
        finish(null);
      }
      return () => {
        active = false;
      };
    },
    launch(app: InstalledApp, refresh) {
      if (disposed) {
        return;
      }
      const log = host.AeroDiagnostics;
      const operation = log?.record("app.launch_requested", { app_id: app.id }) || null;
      const outcome = (status: string, error?: unknown) => {
        if (!log || disposed) {
          return;
        }
        const data = { app_id: app.id, operation_id: operation, status };
        if (error) {
          log.captureError("app.launch_failed", error, data);
        } else {
          log.record("app.launch_" + status, data);
        }
        log.flush?.();
      };
      const label = shortAppName(app.name);
      const accepted = () => outcome("accepted");
      const failed = (error?: unknown) => {
        if (disposed) {
          return;
        }
        outcome("failed", error || { name: "LaunchError", message: "Launch denied" });
        notify("apps.openFailed", { name: label });
        refresh();
      };
      if (!application) {
        outcome("unavailable");
        notify("apps.wouldOpen", { name: label });
        return;
      }
      const link = hbbtvLink(app.id);
      if (link) {
        try {
          const request = control("http://tizen.org/appcontrol/operation/default", [
            { key: "tizenid", values: [app.id] },
            { key: "hbbtv", values: [link] },
            { key: "deeplink", values: ["true"] },
          ]);
          prepareWatch(
            config.HBBTV_APP_ID,
            () => {
              try {
                application.launchAppControl(request, config.HBBTV_APP_ID, accepted, failed);
              } catch (error) {
                failed(error);
              }
            },
            failed,
          );
        } catch (error) {
          failed(error);
        }
        return;
      }
      const isYouTube = /^youtube$/i.test(app.name.trim());
      if (isYouTube && runtime.homewatch.suspendForExternal && !reportsYouTubeVisibility()) {
        const youtubeFailed = (reason?: unknown, detail?: string, error?: unknown) => {
          if (disposed || cancelled(reason)) {
            return;
          }
          outcome("failed", error || { name: "HandoffError", message: reason || "Launch failed" });
          runtime.homewatch.resume?.();
          notify("apps.openFailedDetail", { name: label, reason: detail || "" });
          refresh();
        };
        runtime.homewatch.suspendForExternal(() => {
          if (disposed) {
            return;
          }
          try {
            application.launch(app.id, accepted, (error) =>
              youtubeFailed("launch denied", runtime.translate("handoff.launchDenied"), error),
            );
          } catch (error) {
            youtubeFailed("launch failed", runtime.translate("handoff.launchFailed"), error);
          }
        }, youtubeFailed);
        return;
      }
      prepareWatch(
        app.id,
        () => {
          try {
            application.launch(app.id, accepted, failed);
          } catch (error) {
            failed(error);
          }
        },
        failed,
      );
    },
    openStore() {
      if (disposed) {
        return;
      }
      if (!application) {
        notify("apps.wouldOpenStore");
        return;
      }
      const ids = [...config.STORE_APP_IDS];
      const next = () => {
        if (disposed) {
          return;
        }
        const id = ids.shift();
        if (!id) {
          notify("apps.storeFailed");
          return;
        }
        prepareWatch(
          id,
          () => {
            try {
              application.launch(id, null, next);
            } catch {
              next();
            }
          },
          next,
        );
      };
      next();
    },
    playFireplace(apps) {
      if (disposed) {
        return;
      }
      const youtube = apps.find((app) => /^youtube$/i.test(app.name));
      if (!application || !youtube) {
        openFireplace();
        return;
      }
      const fallback = () => {
        if (!disposed) {
          openFireplace();
        }
      };
      prepareWatch(
        youtube.id,
        () => {
          try {
            const request = control("http://tizen.org/appcontrol/operation/view", [
              { key: "PAYLOAD", values: [JSON.stringify({ values: "v=" + config.FIREPLACE_VIDEO })] },
            ]);
            application.launchAppControl(request, youtube.id, null, fallback);
          } catch {
            fallback();
          }
        },
        fallback,
      );
    },
    dispose() {
      disposed = true;
      handoffPending = false;
    },
  };
};
