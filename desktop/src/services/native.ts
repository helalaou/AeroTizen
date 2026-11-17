import { invoke } from "@tauri-apps/api/core";
import type {
  AppRemovalResult,
  BackendStatus,
  ButtonMappings,
  ButtonTargetApp,
  DesktopService,
  HomeBackupSettings,
  LauncherRelease,
  PreparedHomeApply,
  SavedTv,
  SamsungAccount,
  TvAppPackage,
  TvButtonMapping,
  TvCandidate,
} from "../contracts";

async function readTv<Result>(
  command: "list_tv_apps" | "list_tv_buttons" | "list_tv_button_apps",
  id: string,
  signal: AbortSignal,
): Promise<Result> {
  signal.throwIfAborted();
  const requestId = crypto.getRandomValues(new Uint32Array(4)).join("-");
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation = invoke<void>("cancel_tv_read", { requestId }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await invoke<Result>(command, { id, requestId });
  } finally {
    signal.removeEventListener("abort", cancel);
    await cancellation;
  }
}

export const nativeService: DesktopService = {
  samsung: {
    account: () => invoke<SamsungAccount | null>("samsung_account"),
    signIn: async (signal) => {
      signal.throwIfAborted();
      const requestId = crypto.getRandomValues(new Uint32Array(4)).join("-");
      let cancellation: Promise<void> | undefined;
      const cancel = () => {
        cancellation = invoke<void>("cancel_samsung_sign_in", { requestId }).catch(() => undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const account = await invoke<SamsungAccount>("samsung_sign_in", { requestId });
        signal.throwIfAborted();
        return account;
      } finally {
        signal.removeEventListener("abort", cancel);
        await cancellation;
      }
    },
    signOut: () => invoke<void>("samsung_sign_out"),
    prepareCertificates: (id) =>
      invoke<{ identity_sha256: string; launcher_signing_ready: boolean }>("prepare_signing_profile", { id }),
  },
  status: () => invoke<BackendStatus>("backend_status"),
  launcherCatalog: () => invoke<LauncherRelease[]>("launcher_catalog"),
  list: () => invoke<SavedTv[]>("list_tvs"),
  discover: () => invoke<TvCandidate[]>("discover_tvs"),
  connect: (host, profileId) => invoke<SavedTv>("connect_tv", { host, profileId: profileId ?? null }),
  listApps: (id, signal) => readTv<TvAppPackage[]>("list_tv_apps", id, signal),
  listButtons: (id, signal) => readTv<ButtonMappings>("list_tv_buttons", id, signal),
  buttonActions: {
    listApps: (id, signal) => readTv<ButtonTargetApp[]>("list_tv_button_apps", id, signal),
    change: (id, change) => invoke<TvButtonMapping>("change_tv_button", { id, change }),
    updateInventory: (id, change) => invoke<true>("change_tv_button", { id, change }),
  },
  removeApps: (id, packages) => invoke<AppRemovalResult>("remove_tv_apps", { id, packages }),
  installLauncher: (id, version, currentVersion, confirmReplace) =>
    invoke<SavedTv>("install_launcher", { id, version, currentVersion, confirmReplace }),
  readHomeBackup: (id, capturedAt) => invoke<HomeBackupSettings>("read_home_backup", { id, capturedAt }),
  prepareNativeHome: (id) => invoke<PreparedHomeApply>("prepare_native_home", { id }),
  applyNativeHome: (id, backupSha256) => invoke<SavedTv>("apply_native_home", { id, backupSha256 }),
  restoreHomeBackup: (id, capturedAt) => invoke<SavedTv>("restore_home_backup", { id, capturedAt }),
  rename: (id, name) => invoke<void>("rename_tv", { id, name }),
  forget: (id) => invoke<void>("forget_tv", { id }),
};
