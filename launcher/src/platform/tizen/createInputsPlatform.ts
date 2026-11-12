import type { InputsPlatform } from "../../contracts/inputs";
import type { InputSource } from "../../contracts/launcher";
import type { NativeHdmiHandoff } from "../../contracts/nativeNavigation";
import { hasRecognizedDevice, sourceKey } from "../../shared/inputs/inputSources";

import type { IpControlTizen } from "./createIpControlPlatform";
import { createIpControlPlatform } from "./createIpControlPlatform";

export interface InputsTizen extends IpControlTizen {
  application?: {
    getCurrentApplication(): { getRequestedAppControl(): { appControl?: { operation?: string } } | null };
  };
  systeminfo?: {
    addPropertyValueChangeListener?(property: string, listener: () => void): number;
    getPropertyValue?(property: string, done: (info: unknown) => void, failed: () => void): void;
    removePropertyValueChangeListener?(id: number): void;
  };
  tvwindow?: {
    getSource?(target: string): unknown;
    hide(done: () => void, failed: () => void, target: string): void;
    setSource(source: unknown, done: () => void, failed: () => void, target: string): void;
    show(done: () => void, failed: () => void, rectangle: string[], target: string): void;
  };
}

interface InputsHost {
  addEventListener(type: string, listener: () => void): void;
  AeroTizen: {
    config?: { SERVICE_ID: string };
    homewatch: {
      openNativeViewer?(source: unknown, hdmi: NativeHdmiHandoff | null): boolean;
      start?(ready: () => void, failed: () => void): void;
    };
    tizen?: InputsTizen | null;
  };
  clearTimeout?(id: number): void;
  document: {
    addEventListener(type: string, listener: () => void): void;
    readonly hidden: boolean;
    removeEventListener(type: string, listener: () => void): void;
  };
  removeEventListener(type: string, listener: () => void): void;
  setTimeout?(callback: () => void, timeoutMs: number): number;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

export const createInputsPlatform = (host: InputsHost): InputsPlatform => {
  const tizen = host.AeroTizen.tizen;
  const system = tizen?.systeminfo;
  const window = tizen?.tvwindow;
  let nativeSources = new Map<string, unknown>();
  const nativeSource = (source: InputSource) => source.raw || nativeSources.get(sourceKey(source)) || source;
  return {
    ipControl:
      host.AeroTizen.config && host.setTimeout && host.clearTimeout
        ? createIpControlPlatform({
            AeroTizen: { ...host.AeroTizen, config: host.AeroTizen.config },
            setTimeout: host.setTimeout.bind(host),
            clearTimeout: host.clearTimeout.bind(host),
          })
        : undefined,
    native: !!system,
    canEmbed: !!window,
    get refreshBeforeHdmi() {
      return typeof system?.getPropertyValue === "function";
    },
    isHidden: () => host.document.hidden,
    read(done) {
      let active = true;
      const finish = (sources: readonly InputSource[] | null) => {
        if (active) {
          active = false;
          done(sources);
        }
      };
      if (!system) {
        finish(null);
      } else {
        try {
          if (!system.getPropertyValue) {
            finish(null);
          }
          system.getPropertyValue?.(
            "VIDEOSOURCE",
            (value) => {
              if (!active) {
                return;
              }
              const info = record(value);
              if (!info || (!Array.isArray(info.connected) && !Array.isArray(info.disconnected))) {
                finish(null);
                return;
              }
              let current: Record<string, unknown> | null = null;
              try {
                current = record(window?.getSource?.("MAIN"));
              } catch {
                /* No active TV window. */
              }
              const sources = new Map<string, { source: InputSource; native: unknown }>();
              const add = (list: unknown, connected: boolean) => {
                if (!Array.isArray(list)) {
                  return;
                }
                for (const value of list as unknown[]) {
                  const entry = record(value);
                  if (
                    !entry ||
                    typeof entry.type !== "string" ||
                    entry.type === "MEDIA" ||
                    typeof entry.number !== "number" ||
                    !Number.isFinite(entry.number)
                  ) {
                    continue;
                  }
                  const signal = connected || entry.signal === true;
                  const source: InputSource = {
                    type: entry.type,
                    number: entry.number,
                    editName: typeof entry.editName === "string" ? entry.editName : undefined,
                    connected: signal,
                    active: !!(
                      signal &&
                      current &&
                      entry.type === "HDMI" &&
                      current.type === "HDMI" &&
                      Number(current.number) === entry.number
                    ),
                  };
                  const key = sourceKey(source);
                  const prior = sources.get(key);
                  if (!prior) {
                    sources.set(key, { source, native: value });
                    continue;
                  }
                  const preferred = !prior.source.connected && source.connected ? { source, native: value } : prior;
                  const alternate = preferred === prior ? source : prior.source;
                  const merged =
                    !hasRecognizedDevice(preferred.source) && hasRecognizedDevice(alternate)
                      ? { ...preferred.source, editName: alternate.editName }
                      : preferred.source;
                  sources.set(key, { source: merged, native: preferred.native });
                }
              };
              add(info.connected, true);
              add(info.disconnected, false);
              nativeSources = new Map([...sources].map(([key, value]) => [key, value.native]));
              finish(
                [...sources.values()]
                  .map(({ source }) => source)
                  .sort(
                    (a, b) =>
                      Number(a.type === "TV") - Number(b.type === "TV") ||
                      Number(b.connected) - Number(a.connected) ||
                      (a.number || 0) - (b.number || 0),
                  ),
              );
            },
            () => finish(null),
          );
        } catch {
          finish(null);
        }
      }
      return () => {
        active = false;
      };
    },
    openNative(source, hdmi) {
      return host.AeroTizen.homewatch.openNativeViewer?.(nativeSource(source), hdmi) === true;
    },
    setSource(source, done, failed) {
      window?.setSource(nativeSource(source), done, failed, "MAIN");
    },
    show(done, failed) {
      window?.show(done, failed, ["0px", "0px", "1920px", "1080px"], "MAIN");
    },
    hide() {
      try {
        window?.hide(
          () => {},
          () => {},
          "MAIN",
        );
      } catch {
        /* Already hidden. */
      }
    },
    subscribeSources(listener) {
      let active = true;
      let watch: number | undefined;
      if (system?.addPropertyValueChangeListener && system.removePropertyValueChangeListener) {
        try {
          watch = system.addPropertyValueChangeListener("VIDEOSOURCE", () => {
            if (active) {
              listener();
            }
          });
        } catch {
          /* Foreground polling covers missed or unsupported cable events. */
        }
      }
      return () => {
        if (!active) {
          return;
        }
        active = false;
        if (watch !== undefined) {
          try {
            system?.removePropertyValueChangeListener?.(watch);
          } catch {
            /* Removed by firmware. */
          }
        }
      };
    },
    subscribeVisibility(listener) {
      host.document.addEventListener("visibilitychange", listener);
      return () => host.document.removeEventListener("visibilitychange", listener);
    },
    subscribeHome(listener) {
      const appcontrol = () => {
        try {
          if (
            tizen?.application?.getCurrentApplication().getRequestedAppControl()?.appControl?.operation ===
            "http://tizen.org/appcontrol/operation/main"
          ) {
            listener();
          }
        } catch {
          /* Other launch requests must not interrupt HDMI playback. */
        }
      };
      host.addEventListener("appcontrol", appcontrol);
      return () => host.removeEventListener("appcontrol", appcontrol);
    },
  };
};
