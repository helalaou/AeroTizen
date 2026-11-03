import type { NetworkSnapshot } from "../../contracts/status";

const NETWORK_STATES = {
  ethernet: { symbol: "ethernet", label: "Ethernet" },
  offline: { symbol: "offline", label: "Offline" },
  unknown: { symbol: "unknown", label: "Network status unavailable" },
  wifiUnknown: { symbol: "wifi", label: "Wi-Fi (signal unavailable)" },
  wifiHigh: { symbol: "wifi", label: "Wi-Fi" },
  wifiMedium: { symbol: "wifiHigh", label: "Wi-Fi" },
  wifiLow: { symbol: "wifiLow", label: "Wi-Fi" },
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
