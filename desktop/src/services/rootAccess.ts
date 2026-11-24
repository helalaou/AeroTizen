import type { RootAccessStatus, SavedTv } from "../contracts";
import { validHost } from "../contracts";

export const ROOT_POWER_OFF_SECONDS = 60;

export function rootSetupStage(
  status: RootAccessStatus,
): "prepare" | "restart" | "complete" | "blocked" | "unavailable" {
  if (status.phase === "removing") return "blocked";
  if (status.setup_complete && status.root_available) return "complete";
  if (status.phase === "active" && !status.root_available) return "unavailable";
  if (status.phase === "waiting_boot" || status.phase === "active") return "restart";
  return "prepare";
}

export function rootComputerAddress(profile: SavedTv, status: RootAccessStatus): string | null {
  for (const address of [profile.developer_host, status.original_pc_host]) {
    if (address && validHost(address) && !address.startsWith("127.")) return address;
  }
  return null;
}

export function profileAfterRootChange(profile: SavedTv, status: RootAccessStatus): SavedTv {
  const ready = status.setup_complete && status.root_available;
  const disabled = status.phase === "removed" || status.removal_prepared;
  if (!ready && !disabled) return profile;
  return {
    ...profile,
    transport: ready ? "paired_root" : "developer",
    technical_details: profile.technical_details
      ? {
          ...profile.technical_details,
          root_runtime_version: ready ? status.runtime_version : null,
        }
      : undefined,
  };
}
