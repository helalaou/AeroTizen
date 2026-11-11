import type { DiagnosticRecord, UiDiagnostics } from "../contracts/diagnostics";

import { createDiagnostics } from "./createDiagnostics";
import { createDiagnosticsPrivacy } from "./createDiagnosticsPrivacy";
import type { DiagnosticsStorageHost } from "./openDiagnosticsStorage";
import { openDiagnosticsStorage } from "./openDiagnosticsStorage";

const BATCH_SIZE = 24;
const MAX_BATCH_CHARACTERS = 4000;
const REQUEST_TIMEOUT_MS = 1500;
const RETRY_DELAYS_MS = [1000, 3000, 10000];
const EVENTS_URL = "http://127.0.0.1:47790/diagnostics/events";
const SUCCESS_STATUS = 200;
const REQUEST_TIMEOUT_STATUS = 408;
const SERVER_ERROR_STATUS = 500;
const SCHEMA_VERSION = 1;
const BUILD_KEYS = ["version", "build_id", "commit", "dirty"] as const;

interface DiagnosticsHost extends DiagnosticsStorageHost {
  addEventListener: Window["addEventListener"];
  AeroBuildInfo?: Record<string, unknown>;
  clearTimeout(id: number): void;
  document: Pick<Document, "addEventListener" | "hidden">;
  tizen?: {
    application?: {
      getAppInfo?(): { version: unknown };
      getCurrentApplication?(): { getRequestedAppControl(): { appControl?: { operation?: unknown } } | null };
    };
  };
  XMLHttpRequest?: new () => XMLHttpRequest;
}

export const installUiDiagnostics = (host: DiagnosticsHost, openStorage = openDiagnosticsStorage): UiDiagnostics => {
  const logger = createDiagnostics("ui", { later: (callback, delayMs) => host.setTimeout(callback, delayMs) });
  const packetPrivacy = createDiagnosticsPrivacy();
  let busy = false;
  let sent: Record<string, boolean> = {};
  let sendTimer: number | null = null;
  let retryTimer: number | null = null;
  let retries = 0;
  let version: unknown = "unknown";
  const delivery: { state: "idle" | "unavailable" | "rejected" | "acknowledged"; last_status: number | null } = {
    state: "idle",
    last_status: null,
  };
  const cancelRetry = () => {
    if (retryTimer !== null) {
      host.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
  const retry = () => {
    if (host.document.hidden || retryTimer !== null || retries >= RETRY_DELAYS_MS.length) {
      return;
    }
    retryTimer = host.setTimeout(() => {
      retryTimer = null;
      flush();
    }, RETRY_DELAYS_MS[retries++]);
  };
  // Callers queue work; encoding and HTTP requests run in a later task.
  function flush() {
    if (
      busy ||
      sendTimer !== null ||
      retryTimer !== null ||
      !host.tizen ||
      !host.XMLHttpRequest ||
      host.document.hidden
    ) {
      return;
    }
    sendTimer = host.setTimeout(() => {
      sendTimer = null;
      send();
    }, 0);
  }
  const send = () => {
    if (busy || host.document.hidden || !host.XMLHttpRequest) {
      return;
    }
    const batch: DiagnosticRecord[] = [];
    logger
      .snapshot()
      .records.filter((item) => !sent[item.id])
      .slice(0, BATCH_SIZE)
      .forEach((item) => {
        if (JSON.stringify(batch.concat([item])).length <= MAX_BATCH_CHARACTERS) {
          batch.push(item);
        }
      });
    if (!batch.length) {
      return;
    }
    busy = true;
    try {
      const request = new host.XMLHttpRequest();
      request.open("POST", EVENTS_URL, true);
      request.setRequestHeader("Content-Type", "text/plain");
      request.timeout = REQUEST_TIMEOUT_MS;
      request.onerror = request.ontimeout = () => {
        busy = false;
        delivery.state = "unavailable";
        delivery.last_status = null;
        retry();
      };
      request.onload = () => {
        busy = false;
        delivery.last_status = request.status;
        delivery.state = "rejected";
        if (request.status !== SUCCESS_STATUS) {
          if (request.status >= SERVER_ERROR_STATUS || request.status === REQUEST_TIMEOUT_STATUS) {
            retry();
          }
          return;
        }
        // Older watchers return 200 for unknown paths. Only accept an exact batch acknowledgement.
        let acknowledgement: unknown;
        try {
          acknowledgement = JSON.parse(request.responseText);
        } catch {
          return;
        }
        if (
          !acknowledgement ||
          typeof acknowledgement !== "object" ||
          !("schema_version" in acknowledgement) ||
          acknowledgement.schema_version !== SCHEMA_VERSION ||
          !("accepted" in acknowledgement) ||
          acknowledgement.accepted !== batch.length
        ) {
          return;
        }
        delivery.state = "acknowledged";
        cancelRetry();
        retries = 0;
        batch.forEach((item) => {
          sent[item.id] = true;
        });
        const keep: Record<string, boolean> = {};
        logger.snapshot().records.forEach((item) => {
          if (sent[item.id]) {
            keep[item.id] = true;
          }
        });
        sent = keep;
        flush();
      };
      const build: Record<string, unknown> = {};
      BUILD_KEYS.forEach((key) => {
        build[key] = packetPrivacy.value(host.AeroBuildInfo?.[key], key);
      });
      request.send(
        JSON.stringify({
          schema_version: SCHEMA_VERSION,
          records: batch,
          health: logger.health(),
          build,
          version: packetPrivacy.value(version, "version"),
          delivery: { state: delivery.state, retries, last_status: delivery.last_status },
          queued: logger.snapshot().records.filter((item) => !sent[item.id]).length,
        }),
      );
    } catch {
      busy = false;
      delivery.state = "unavailable";
      retry();
    }
  };
  try {
    openStorage(host, (storage) => {
      if (storage) {
        logger.attach(storage, flush);
      }
    });
  } catch {
    /* optional async storage */
  }
  host.addEventListener("pagehide", () => logger.flushStorage());
  try {
    version = host.tizen?.application?.getAppInfo?.().version ?? "unknown";
  } catch {
    /* older API */
  }
  logger.record("ui.start", {
    component: "launcher",
    version,
    build_id: host.AeroBuildInfo?.build_id,
    commit: host.AeroBuildInfo?.commit,
  });
  host.addEventListener("error", (event) => {
    logger.captureError("ui.error", event.error || { name: "ScriptError", message: event.message }, {
      file: event.filename,
      line: event.lineno || 0,
      column: event.colno || 0,
    });
    flush();
  });
  host.addEventListener("unhandledrejection", (event) => {
    logger.captureError("ui.rejection", event.reason || { name: "UnhandledRejection" });
    flush();
  });
  host.addEventListener("load", () => {
    logger.record("ui.loaded");
    flush();
  });
  host.addEventListener("appcontrol", () => {
    let operation: unknown = "";
    try {
      operation =
        host.tizen?.application?.getCurrentApplication?.().getRequestedAppControl()?.appControl?.operation ?? "";
    } catch {
      /* older API */
    }
    logger.record("ui.appcontrol", { operation });
    flush();
  });
  host.document.addEventListener("visibilitychange", () => {
    logger.record("ui.visibility", { hidden: host.document.hidden });
    cancelRetry();
    retries = 0;
    if (sendTimer !== null) {
      host.clearTimeout(sendTimer);
      sendTimer = null;
    }
    logger.flushStorage();
    if (!host.document.hidden) {
      flush();
    }
  });
  return { ...logger, flush };
};
