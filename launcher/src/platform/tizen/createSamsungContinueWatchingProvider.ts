import type { AppRecord } from "../../contracts/apps";
import type { ContinueWatchingProvider } from "../../contracts/continueWatching";
import type { ContinueSource } from "../../contracts/launcher";
import type { AppCatalog } from "../../shared/apps/appCatalog";
import { shortAppName } from "../../shared/apps/appNames";

import type { LauncherRuntime } from "./launcherRuntime";

const METADATA_PREFIX = "http://samsung.com/tv/metadata/";
const ENDPOINT = "http://localhost:9013/?module=EBHelper&func=GetItems";
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_CHARACTERS = 2_000_000;

type FeedRequest = Pick<
  XMLHttpRequest,
  | "abort"
  | "onabort"
  | "onerror"
  | "onload"
  | "ontimeout"
  | "open"
  | "responseText"
  | "send"
  | "setRequestHeader"
  | "status"
  | "timeout"
>;

interface Dependencies {
  catalog: Pick<AppCatalog, "storeId">;
  createRequest(): FeedRequest;
  now(): number;
  runtime: Pick<LauncherRuntime, "config" | "homewatch" | "tizen" | "toast" | "translate">;
}

interface PackageGroup {
  apps: AppRecord[];
  supported: boolean;
}

const supportsContinueWatching = (entry: unknown) => {
  if (!entry || typeof entry !== "object" || !("key" in entry) || !("value" in entry)) {
    return false;
  }
  return (
    (entry.key === METADATA_PREFIX + "app_support_continue_watching" && entry.value === "true") ||
    (entry.key === METADATA_PREFIX + "use.continue_watching" && entry.value === "bg_service")
  );
};
const cancelled = (error: unknown) =>
  !!error && typeof error === "object" && "cancelled" in error && error.cancelled === true;

export const createSamsungContinueWatchingProvider = ({
  catalog,
  runtime,
  createRequest,
  now,
}: Dependencies): ContinueWatchingProvider => {
  const requests = new Map<FeedRequest, () => void>();
  let requestId = 0;
  let disposed = false;
  const cancel = () => {
    const pending = [...requests];
    requests.clear();
    pending.forEach(([request, finish]) => {
      // Settle first: some TV engines do not deliver onabort, or deliver it late.
      finish();
      try {
        request.abort();
      } catch {
        /* Other pending reads must still be cancelled. */
      }
    });
  };
  return {
    discover(inventory) {
      if (disposed) {
        return [];
      }
      const groups = Object.create(null) as Record<string, PackageGroup>;
      inventory.forEach((app) => {
        const key = app.packageId || app.id;
        const group = groups[key] || (groups[key] = { apps: [], supported: false });
        group.apps.push(app);
        try {
          const metadata = runtime.tizen?.application?.getAppMetaData?.(app.id);
          if (Array.isArray(metadata)) {
            group.supported = group.supported || (metadata as unknown[]).some(supportsContinueWatching);
          }
        } catch {
          /* Unavailable metadata does not establish support. */
        }
      });
      const found: ContinueSource[] = [];
      Object.keys(groups).forEach((key) => {
        const group = groups[key];
        if (!group.supported) {
          return;
        }
        const foreground = group.apps.filter(
          (app) => app.show !== false && app.name && !runtime.config.HIDDEN_APPS.test(app.id),
        );
        foreground.sort((left, right) => Number(!!catalog.storeId(right.id)) - Number(!!catalog.storeId(left.id)));
        const app = foreground[0];
        if (!app) {
          return;
        }
        const storeId = catalog.storeId(app.id);
        found.push({
          id: app.id,
          name: shortAppName(app.name || ""),
          icon: app.iconPath || "",
          storeId: storeId || "",
          status: storeId ? "Not selected" : "App ID unavailable",
        });
      });
      return found;
    },
    read(source, done) {
      if (disposed) {
        done(true);
        return;
      }
      let request: FeedRequest;
      try {
        request = createRequest();
      } catch {
        done(true);
        return;
      }
      let settled = false;
      const finish = (error: boolean, records?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        requests.delete(request);
        done(error, records);
      };
      requests.set(request, () => finish(true));
      request.onload = () => {
        let records: unknown;
        try {
          if (request.status !== 200 || request.responseText.length > MAX_RESPONSE_CHARACTERS) {
            finish(true);
            return;
          }
          records = JSON.parse(request.responseText) as unknown;
        } catch {
          finish(true);
          return;
        }
        finish(!Array.isArray(records), records);
      };
      request.onerror = request.ontimeout = request.onabort = () => finish(true);
      try {
        // app_id alone is not a cache key. Keep every source and retry fresh.
        const key = source.storeId + "-" + now() + "-" + ++requestId;
        request.open("GET", ENDPOINT + "&_aerotizen=" + encodeURIComponent(key), true);
        request.timeout = TIMEOUT_MS;
        request.setRequestHeader("app_id", source.storeId);
        request.send();
      } catch {
        finish(true);
      }
    },
    cancel,
    open(item) {
      if (disposed) {
        return;
      }
      const failed = (error?: unknown) => {
        if (!disposed && !cancelled(error)) {
          runtime.toast(runtime.translate("apps.openFailed", { name: item.title }));
        }
      };
      try {
        const tizen = runtime.tizen;
        if (!tizen?.ApplicationControl || !tizen.ApplicationControlData || !tizen.application) {
          failed();
          return;
        }
        const data = [new tizen.ApplicationControlData("PAYLOAD", [JSON.stringify({ values: item.payload })])];
        const control = new tizen.ApplicationControl(
          "http://tizen.org/appcontrol/operation/view",
          null,
          null,
          null,
          data,
        );
        let launched = false;
        const launch = () => {
          // Feed cancellation on hide must not cancel a valid app handoff.
          if (disposed || launched) {
            return;
          }
          launched = true;
          try {
            tizen.application?.launchAppControl(control, item.sourceId, null, failed);
          } catch {
            failed();
          }
        };
        if (runtime.homewatch.prepareAppLaunch) {
          runtime.homewatch.prepareAppLaunch(item.sourceId, launch, failed);
        } else {
          runtime.homewatch.watch(item.sourceId);
          launch();
        }
      } catch {
        failed();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancel();
    },
  };
};
