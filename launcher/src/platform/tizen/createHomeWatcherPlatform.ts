import type { HomeWatcherPlatform, HomeWatcherReply } from "../../contracts/homeWatcher";
import type { Translate } from "../../shared/i18n/createTranslations";

import { SAMSUNG_HOME_APP_ID } from "./nativeApplicationIds";

const HTTP_OK = 200;
const PLATFORM_VERSION_CAPABILITY = "http://tizen.org/feature/platform.version";
const SERVICE_OPERATION = "http://tizen.org/appcontrol/operation/service";
const SERVICE_MODULE_EVENT = "aero-wrt-service";
// Keep the TV-only module outside the browser bundle and load it only on demand.
const SERVICE_MODULE_SOURCE =
  "import { Service } from 'wrt:service'; window.dispatchEvent(new CustomEvent('aero-wrt-service', { detail: Service }));";

type WatcherRequest = Pick<
  XMLHttpRequest,
  "abort" | "onerror" | "onload" | "ontimeout" | "open" | "responseText" | "send" | "status" | "timeout"
>;
type NativeService = new (id: string) => { start(): PromiseLike<unknown> | void };

export interface HomeWatcherTizen {
  application?: {
    launch(id: string, done: null, failed: () => void): void;
    launchAppControl(control: unknown, id: string, done: () => void, failed: () => void): void;
  };
  ApplicationControl?: new (operation: string) => unknown;
  systeminfo?: { getCapability(key: string): string };
}

interface HomeWatcherHost {
  addEventListener(type: string, listener: EventListener): void;
  AeroDiagnostics?: {
    flush(): void;
    record(event: string, data: Readonly<Record<string, unknown>>): unknown;
  };
  AeroTizen: {
    config: { SERVICE_ID: string; SERVICE_URL: string };
    tizen?: HomeWatcherTizen | null;
    toast(message: string): void;
    translate: Translate;
  };
  document: Pick<Document, "addEventListener" | "body" | "createElement" | "hidden" | "removeEventListener">;
  removeEventListener(type: string, listener: EventListener): void;
  XMLHttpRequest: new () => WatcherRequest;
}

export const createHomeWatcherPlatform = (host: HomeWatcherHost): HomeWatcherPlatform => {
  const runtime = host.AeroTizen;
  const config = runtime.config;
  const tizen = runtime.tizen;
  let Service: NativeService | undefined;
  return {
    available: !!tizen,
    flushDiagnostics: () => host.AeroDiagnostics?.flush(),
    isHidden: () => host.document.hidden,
    loadServiceModule(ready, failed) {
      if (Service) {
        ready();
        return () => undefined;
      }
      let active = true;
      const script = host.document.createElement("script");
      const loaded = (event: Event) => {
        const detail: unknown = (event as CustomEvent<unknown>).detail;
        if (!active || typeof detail !== "function") {
          return;
        }
        Service = detail as NativeService;
        host.removeEventListener(SERVICE_MODULE_EVENT, loaded);
        ready();
      };
      host.addEventListener(SERVICE_MODULE_EVENT, loaded);
      script.type = "module";
      script.textContent = SERVICE_MODULE_SOURCE;
      script.onerror = () => {
        if (active) {
          failed();
        }
      };
      host.document.body.appendChild(script);
      return () => {
        active = false;
        host.removeEventListener(SERVICE_MODULE_EVENT, loaded);
        script.onerror = null;
        script.parentNode?.removeChild(script);
      };
    },
    notify: (message) => runtime.toast(runtime.translate(message)),
    openSamsungHome(failed) {
      try {
        if (!tizen?.application) {
          failed();
          return;
        }
        tizen.application.launch(SAMSUNG_HOME_APP_ID, null, failed);
      } catch {
        failed();
      }
    },
    platformVersion() {
      try {
        return parseFloat(tizen?.systeminfo?.getCapability(PLATFORM_VERSION_CAPABILITY) || "");
      } catch {
        return 0;
      }
    },
    record: (event, data) => {
      host.AeroDiagnostics?.record(event, data);
    },
    request(path, timeoutMs, done, failed) {
      let settled = false;
      let xhr: WatcherRequest | undefined;
      const fail = () => {
        if (!settled) {
          settled = true;
          failed();
        }
      };
      try {
        xhr = new host.XMLHttpRequest();
        xhr.open("GET", config.SERVICE_URL + path);
        xhr.timeout = timeoutMs;
        xhr.onerror = xhr.ontimeout = fail;
        xhr.onload = () => {
          if (settled || !xhr) {
            return;
          }
          let value: unknown;
          try {
            value = JSON.parse(xhr.responseText);
          } catch {
            fail();
            return;
          }
          if (xhr.status !== HTTP_OK || !value || typeof value !== "object") {
            fail();
            return;
          }
          settled = true;
          done(value as HomeWatcherReply);
        };
        xhr.send();
      } catch {
        fail();
      }
      return () => {
        if (!settled) {
          settled = true;
          try {
            xhr?.abort();
          } catch {
            // An unavailable transport must not stop the remaining service cleanup.
          }
        }
      };
    },
    startAppControl(accepted, failed) {
      try {
        if (!tizen?.application || !tizen.ApplicationControl) {
          failed();
          return;
        }
        tizen.application.launchAppControl(
          new tizen.ApplicationControl(SERVICE_OPERATION),
          config.SERVICE_ID,
          accepted,
          failed,
        );
      } catch {
        failed();
      }
    },
    startWrtService(accepted, failed) {
      try {
        if (!Service) {
          failed();
          return;
        }
        const result = new Service(config.SERVICE_ID).start();
        if (result && typeof result.then === "function") {
          result.then(accepted, failed);
        }
      } catch {
        failed();
      }
    },
    subscribeVisibility(listener) {
      host.document.addEventListener("visibilitychange", listener);
      return () => host.document.removeEventListener("visibilitychange", listener);
    },
  };
};
