import type { NetworkSnapshot } from "../../contracts/status";
import { FIXED_NAMES } from "../../shared/fixedNames";

const NETWORK_STATES = {
  ethernet: { symbol: "ethernet", labelKey: "network.ethernet" },
  offline: { symbol: "offline", labelKey: "network.offline" },
  unknown: { symbol: "unknown", labelKey: "network.unavailable" },
  wifiUnknown: { symbol: "wifi", labelKey: "network.signalUnavailable" },
  wifiHigh: { symbol: "wifi", label: FIXED_NAMES.wifi },
  wifiMedium: { symbol: "wifiHigh", label: FIXED_NAMES.wifi },
  wifiLow: { symbol: "wifiLow", label: FIXED_NAMES.wifi },
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
