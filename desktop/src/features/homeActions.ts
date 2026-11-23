import { canApplyNativeHome } from "../contracts";
import type { DesktopService } from "../contracts";
import type { FeatureContext } from "./context";
type HomeContext = Pick<FeatureContext, "selected" | "run" | "updateProfile">;
export function applyNativeHome(
  service: DesktopService,
  context: HomeContext,
  id: string,
  reportError: (message: string) => void,
) {
  const { selected, run, updateProfile } = context;
  const apply = service.applyNativeHome;
  if (!apply) return Promise.resolve(false);
  return run(
    "Applying Native Home…",
    async () => {
      if (selected?.id !== id || !canApplyNativeHome(selected)) {
        throw new Error("Native Home is unavailable for this TV. Refresh the connection and check its settings.");
      }
      const prepared = await service.prepareNativeHome(id);
      if (prepared.id !== id) throw new Error("Could not verify the backup for this TV.");
      updateProfile(id, { ...selected, home_backup: { status: "saved", captured_at: prepared.captured_at } });
      const updated = await apply(id, prepared.backup_sha256);
      if (
        updated.id !== id ||
        updated.home_routing_mode !== "native" ||
        updated.home_backup?.status !== "saved" ||
        updated.home_backup.captured_at !== prepared.captured_at
      ) {
        throw new Error("Could not verify Native Home and its original backup.");
      }
      updateProfile(id, updated);
    },
    "app",
    reportError,
  );
}
export function restoreHomeBackup(
  service: DesktopService,
  context: HomeContext,
  id: string,
  capturedAt: string,
  reportError: (message: string) => void,
) {
  const { selected, run, updateProfile } = context;
  const restoreBackup = service.restoreHomeBackup;
  if (!restoreBackup) return Promise.resolve(false);
  return run(
    "Restoring Home backup…",
    async () => {
      const backup = selected?.home_backup;
      if (selected?.id !== id || backup?.status !== "saved" || backup.captured_at !== capturedAt) {
        throw new Error("The backup changed. Close this dialog and review the current backup.");
      }
      const updated = await restoreBackup(id, capturedAt);
      if (updated.id !== id) throw new Error("Could not verify the restored TV.");
      updateProfile(id, updated);
    },
    "app",
    reportError,
  );
}
