import type { StatusStores } from "../contracts/status";
import { useStore } from "../shared/hooks/useStore";

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
  const lit = strength === null ? 3 : strength > 0.66 ? 3 : strength > 0.33 ? 2 : 1;
  return (
    <svg
      id="network"
      class={"status-icon" + (kind === "offline" ? " offline" : "")}
      viewBox="0 0 24 24"
      hidden={visible ? undefined : true}
      style={{ display: visible ? undefined : "none" }}
      aria-label={translate(label)}
      data-net-kind={kind}
      data-net-level={strength === null ? "unknown" : String(strength)}
    >
      {kind === "wifi" ? (
        <g transform="translate(0 -2)">
          {[
            "M12 18.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z",
            "M5.6 13.4l1.8 1.8a6.5 6.5 0 0 1 9.2 0l1.8-1.8a9 9 0 0 0-12.8 0z",
            "M2 9.8l1.8 1.8a11.6 11.6 0 0 1 16.4 0L22 9.8a14.1 14.1 0 0 0-20 0z",
          ].map((d, i) => (
            <path key={d} fill="currentColor" opacity={i < lit ? 1 : 0.28} d={d} />
          ))}
        </g>
      ) : kind === "ethernet" ? (
        <path fill="currentColor" d="M8 3h8v4h3v6h-3v3h-2v5h-4v-5H8v-3H5V7h3zm2 2v4H7v2h10V9h-3V5z" />
      ) : kind === "offline" ? (
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 3.6-2.2M12 7.5a14 14 0 0 1 9 3.6M2 9.1a14 14 0 0 1 3-1.9"
        />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path d="M3 12h18M12 3v18" fill="none" stroke="currentColor" stroke-width="1.5" />
        </>
      )}
    </svg>
  );
};
