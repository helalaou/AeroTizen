import { EthernetPort, Globe, Wifi, WifiHigh, WifiLow, WifiOff } from "lucide-preact";

import type { StatusStores } from "../contracts/status";
import { useStore } from "../shared/hooks/useStore";
import { Icon } from "../shared/icons/Icon";

import { getNetworkPresentation } from "./presentation/network";

const NETWORK_ICONS = {
  ethernet: EthernetPort,
  offline: WifiOff,
  unknown: Globe,
  wifi: Wifi,
  wifiHigh: WifiHigh,
  wifiLow: WifiLow,
} as const;

export const NetworkStatus = ({ status, translate }: { status: StatusStores; translate(value: string): string }) => {
  const reading = useStore(status.network);
  const { kind, strength, visible } = reading;
  const presentation = getNetworkPresentation(reading);
  return (
    <Icon
      icon={NETWORK_ICONS[presentation.symbol]}
      id="network"
      class={"status-icon" + (kind === "offline" ? " offline" : "")}
      hidden={visible ? undefined : true}
      style={{ display: visible ? undefined : "none" }}
      label={translate(presentation.label)}
      data-net-kind={kind}
      data-net-level={strength === null ? "unknown" : String(strength)}
    />
  );
};
