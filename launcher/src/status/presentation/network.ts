import type { NetworkSnapshot } from "../../contracts/status";

const NETWORK_STATES = {
  ethernet: { symbol: "ethernet", label: "network.ethernet" },
  offline: { symbol: "offline", label: "network.offline" },
  unknown: { symbol: "unknown", label: "network.unavailable" },
  wifiUnknown: { symbol: "wifi", label: "network.signalUnavailable" },
  wifiHigh: { symbol: "wifi", label: "network.wifi" },
  wifiMedium: { symbol: "wifiHigh", label: "network.wifi" },
  wifiLow: { symbol: "wifiLow", label: "network.wifi" },
} as const;

export const getNetworkPresentation = ({ kind, strength }: NetworkSnapshot) => {
  if (kind !== "wifi") {
    return NETWORK_STATES[kind];
  }
  if (strength === null) {
    return NETWORK_STATES.wifiUnknown;
  }
  if (strength > 0.66) {
    return NETWORK_STATES.wifiHigh;
  }
  if (strength > 0.33) {
    return NETWORK_STATES.wifiMedium;
  }
  return NETWORK_STATES.wifiLow;
};
