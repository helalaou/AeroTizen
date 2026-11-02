import { EthernetPort, Globe, Wifi, WifiHigh, WifiLow, WifiOff } from "lucide-preact";

import type { StatusStores } from "../contracts/status";
import { useStore } from "../shared/hooks/useStore";
import { Icon } from "../shared/icons/Icon";

export const NetworkStatus = ({ status, translate }: { status: StatusStores; translate(value: string): string }) => {
  const { kind, strength, visible } = useStore(status.network);
  const label =
    kind === "ethernet"
      ? "Ethernet"
      : kind === "offline"
        ? "Offline"
        : kind === "wifi"
          ? strength === null
            ? "Wi-Fi (signal unavailable)"
            : "Wi-Fi"
          : "Network status unavailable";
  const glyph =
    kind === "wifi"
      ? strength === null || strength > 0.66
        ? Wifi
        : strength > 0.33
          ? WifiHigh
          : WifiLow
      : kind === "ethernet"
        ? EthernetPort
        : kind === "offline"
          ? WifiOff
          : Globe;
  return (
    <Icon
      icon={glyph}
      id="network"
      class={"status-icon" + (kind === "offline" ? " offline" : "")}
      hidden={visible ? undefined : true}
      style={{ display: visible ? undefined : "none" }}
      label={translate(label)}
      data-net-kind={kind}
      data-net-level={strength === null ? "unknown" : String(strength)}
    />
  );
};
