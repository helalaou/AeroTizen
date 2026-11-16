import { invoke } from "@tauri-apps/api/core";
import type { BackendStatus, DesktopService, LauncherRelease, SavedTv, TvCandidate } from "../contracts";

export const nativeService: DesktopService = {
  status: () => invoke<BackendStatus>("backend_status"),
  launcherCatalog: () => invoke<LauncherRelease[]>("launcher_catalog"),
  list: () => invoke<SavedTv[]>("list_tvs"),
  discover: () => invoke<TvCandidate[]>("discover_tvs"),
  connect: (host, profileId) => invoke<SavedTv>("connect_tv", { host, profileId: profileId ?? null }),
  installLauncher: (id, version, currentVersion, confirmReplace) =>
    invoke<SavedTv>("install_launcher", { id, version, currentVersion, confirmReplace }),
  rename: (id, name) => invoke<void>("rename_tv", { id, name }),
  forget: (id) => invoke<void>("forget_tv", { id }),
};
