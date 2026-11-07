import type { NetworkPlatform, NetworkReading } from "../../contracts/status";

interface SystemInfoValue {
  networkType?: unknown;
  signalStrength?: unknown;
}

interface SystemInfo {
  addPropertyValueChangeListener?(property: "NETWORK", listener: () => void): number;
  getPropertyValue(
    property: "NETWORK" | "WIFI_NETWORK",
    done: (value?: SystemInfoValue | null) => void,
    fail: () => void,
  ): void;
  removePropertyValueChangeListener?(id: number): void;
}

interface NetworkHost extends Pick<Window, "addEventListener" | "removeEventListener"> {
  navigator: Pick<Navigator, "onLine">;
  tizen?: { systeminfo?: SystemInfo };
  webapis?: { network?: { getWiFiSignalStrengthLevel?(): unknown } };
}

const SIGNAL_STRENGTHS = [0.2, 0.5, 0.5, 1, 1] as const;

export const createNetworkPlatform = (host: NetworkHost): NetworkPlatform => {
  const system = host.tizen?.systeminfo;
  return {
    read(done) {
      let cancelled = false;
      const publish = (reading: NetworkReading) => {
        if (!cancelled) {
          done(reading);
        }
      };
      const unknown = () => publish({ kind: host.navigator.onLine === false ? "offline" : "unknown", strength: null });
      const readWifi = () => {
        try {
          const level = host.webapis?.network?.getWiFiSignalStrengthLevel?.();
          if (typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 5) {
            const strength = SIGNAL_STRENGTHS[level - 1];
            publish({ kind: "wifi", strength });
            return;
          }
        } catch {
          // Unsupported Samsung signal levels use the standard Tizen property.
        }
        try {
          system?.getPropertyValue(
            "WIFI_NETWORK",
            (value) => {
              const strength = value?.signalStrength;
              publish({
                kind: "wifi",
                strength:
                  typeof strength === "number" && Number.isFinite(strength) && strength >= 0 && strength <= 1
                    ? strength
                    : null,
              });
            },
            () => publish({ kind: "wifi", strength: null }),
          );
        } catch {
          publish({ kind: "wifi", strength: null });
        }
      };
      try {
        if (!system) {
          unknown();
        } else {
          system.getPropertyValue(
            "NETWORK",
            (value) => {
              if (cancelled) {
                return;
              }
              if (value?.networkType === "ETHERNET") {
                publish({ kind: "ethernet", strength: null });
                return;
              }
              if (value?.networkType === "NONE") {
                publish({ kind: "offline", strength: null });
                return;
              }
              if (value?.networkType === "WIFI") {
                readWifi();
                return;
              }
              unknown();
            },
            unknown,
          );
        }
      } catch {
        unknown();
      }
      return () => {
        cancelled = true;
      };
    },
    subscribe(listener) {
      let active = true;
      let watch: number | undefined;
      const changed = () => {
        if (active) {
          listener();
        }
      };
      // Only register a native watch when the platform can also release it.
      if (system?.addPropertyValueChangeListener && system.removePropertyValueChangeListener) {
        try {
          watch = system.addPropertyValueChangeListener("NETWORK", changed);
        } catch {
          // Polling and browser connectivity events remain available.
        }
      }
      host.addEventListener("online", changed);
      host.addEventListener("offline", changed);
      return () => {
        if (!active) {
          return;
        }
        active = false;
        host.removeEventListener("online", changed);
        host.removeEventListener("offline", changed);
        if (watch !== undefined) {
          try {
            system?.removePropertyValueChangeListener?.(watch);
          } catch {
            // Ignore a watch already removed by the TV.
          }
        }
      };
    },
  };
};
