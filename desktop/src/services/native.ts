import { invoke } from "@tauri-apps/api/core";
import type {
  AppRemovalResult,
  DesktopStatus,
  ButtonMappings,
  ButtonTargetApp,
  DesktopService,
  HomeBackupSettings,
  LauncherRelease,
  LauncherRemovalReview,
  LocalAppPackage,
  LocalAppInstallResult,
  RootAccessStatus,
  PreparedHomeApply,
  SavedTv,
  SamsungAccount,
  TvAppPackage,
  TvButtonMapping,
  TvCandidate,
} from "../contracts";

async function readTv<Result>(
  command:
    | "list_tv_apps"
    | "list_tv_buttons"
    | "list_tv_button_apps"
    | "root_access_status"
    | "check_tv_diagnostics"
    | "review_launcher_removal",
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
  rootAccess: {
    status: (id, signal) => readTv<RootAccessStatus>("root_access_status", id, signal),
    revealRecovery: (id) => invoke<void>("reveal_root_recovery", { id }),
    setup: (id, action) => invoke<RootAccessStatus>("setup_root_access", { id, action, confirmed: true }),
    upgrade: (id, action) => invoke<RootAccessStatus>("upgrade_root_access", { id, action, confirmed: true }),
    remove: (id, action) => invoke<RootAccessStatus>("remove_root_access", { id, action, confirmed: true }),
  },
  localApps: {
    choose: (id) => invoke<LocalAppPackage | null>("choose_local_app", { id }),
    install: (id, selectionId, confirmInstall) =>
      invoke<LocalAppInstallResult>("install_local_app", { id, selectionId, confirmInstall }),
  },
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
  status: () => invoke<DesktopStatus>("desktop_status"),
  launcherCatalog: () => invoke<LauncherRelease[]>("launcher_catalog"),
  list: () => invoke<SavedTv[]>("list_tvs"),
  discover: () => invoke<TvCandidate[]>("discover_tvs"),
  connect: (host, profileId) => invoke<SavedTv>("connect_tv", { host, profileId: profileId ?? null }),
  checkDiagnostics: (id, signal) => readTv<SavedTv>("check_tv_diagnostics", id, signal),
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
  reviewLauncherRemoval: (id, signal) => readTv<LauncherRemovalReview>("review_launcher_removal", id, signal),
  removeLauncher: (id, revision, confirmed) => invoke<SavedTv>("remove_launcher", { id, revision, confirmed }),
  readHomeBackup: (id, capturedAt) => invoke<HomeBackupSettings>("read_home_backup", { id, capturedAt }),
  prepareNativeHome: (id) => invoke<PreparedHomeApply>("prepare_native_home", { id }),
  applyNativeHome: (id, backupSha256) => invoke<SavedTv>("apply_native_home", { id, backupSha256 }),
  restoreHomeBackup: (id, capturedAt) => invoke<SavedTv>("restore_home_backup", { id, capturedAt }),
  rename: (id, name) => invoke<void>("rename_tv", { id, name }),
  forget: (id) => invoke<void>("forget_tv", { id }),
};
