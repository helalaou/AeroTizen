import { invoke } from "@tauri-apps/api/core";
import type {
  AppRemovalResult,
  BackendStatus,
  DesktopService,
  HomeBackupSettings,
  LauncherRelease,
  SavedTv,
  TvAppPackage,
  TvCandidate,
} from "../contracts";

async function listApps(id: string, signal: AbortSignal): Promise<TvAppPackage[]> {
  signal.throwIfAborted();
  const requestId = crypto.getRandomValues(new Uint32Array(4)).join("-");
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation = invoke<void>("cancel_tv_app_list", { requestId }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await invoke<TvAppPackage[]>("list_tv_apps", { id, requestId });
  } finally {
    signal.removeEventListener("abort", cancel);
    await cancellation;
  }
}

export const nativeService: DesktopService = {
  status: () => invoke<BackendStatus>("backend_status"),
  launcherCatalog: () => invoke<LauncherRelease[]>("launcher_catalog"),
  list: () => invoke<SavedTv[]>("list_tvs"),
  discover: () => invoke<TvCandidate[]>("discover_tvs"),
  connect: (host, profileId) => invoke<SavedTv>("connect_tv", { host, profileId: profileId ?? null }),
  listApps,
  removeApps: (id, packages) => invoke<AppRemovalResult>("remove_tv_apps", { id, packages }),
  installLauncher: (id, version, currentVersion, confirmReplace) =>
    invoke<SavedTv>("install_launcher", { id, version, currentVersion, confirmReplace }),
  readHomeBackup: (id, capturedAt) => invoke<HomeBackupSettings>("read_home_backup", { id, capturedAt }),
  restoreHomeBackup: (id, capturedAt) => invoke<SavedTv>("restore_home_backup", { id, capturedAt }),
  rename: (id, name) => invoke<void>("rename_tv", { id, name }),
  forget: (id) => invoke<void>("forget_tv", { id }),
};
