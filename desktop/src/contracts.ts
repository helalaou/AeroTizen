export interface TvCandidate {
  host: string;
  name: string;
  model: string;
}

export interface SavedTv extends TvCandidate {
  id: string;
  identity_sha256: string;
  launcher_version: string | null;
  launcher_signing_ready: boolean;
  transport: "developer" | "paired_root";
  developer_mode: string;
  developer_host: string;
  checked_at: string;
  technical_details?: TechnicalDetails;
  home_backup?: HomeBackup;
  home_routing_mode?: HomeRoutingMode;
  native_home_settings?: NativeHomeSettings;
}

export type HomeBackup = { status: "saved"; captured_at: string } | { status: "missing" | "unreadable" };
export interface PreparedHomeApply {
  id: string;
  captured_at: string;
  backup_sha256: string;
}
export type HomeRoutingMode = "watcher" | "native" | "hold" | "blocked";

export interface NativeHomeSettings {
  home_button_app: string | null;
  home_app: string | null;
  startup_app: string | null;
  startup_backup_app: string | null;
  smart_hub_autostart: boolean | null;
}

export interface HomeBackupSettings extends NativeHomeSettings {
  first_screen: string;
}

export interface TechnicalDetails {
  model_code: string | null;
  tizen_version: string | null;
  architecture: string | null;
  platform: string | null;
  root_runtime_version: string | null;
}

export interface BackendStatus {
  name: string;
  version: string;
  operations: string[];
}

export interface LauncherRelease {
  version: string;
  sections: { heading: string | null; changes: string[] }[];
}

export interface TvAppPackage {
  id: string;
  name: string;
  apps: string[];
  protected: boolean;
  revision: string;
}

export type AppPackageSelection = Pick<TvAppPackage, "id" | "revision">;
export type AppRemovalStatus = "removed" | "refused" | "still_installed" | "unverified" | "not_attempted";
export interface AppRemovalOutcome {
  id: string;
  status: AppRemovalStatus;
  detail?: string;
}
export interface AppRemovalResult {
  apps: TvAppPackage[] | null;
  results: AppRemovalOutcome[];
}
export type NamedAppRemovalOutcome = AppRemovalOutcome & { name: string };

export interface TvButtonMapping {
  button: string;
  mode: "default" | "app" | "disabled";
  app_id: string | null;
  app_name: string | null;
  active: boolean;
}

export type ButtonMappings =
  | { status: "ready"; buttons: TvButtonMapping[]; discovery_detail: string | null }
  | { status: "pairing_required" | "helper_update_required" };

export interface ButtonTargetApp {
  id: string;
  name: string;
}

export type ButtonChange = { button: string } & ({ mode: "app"; app_id: string } | { mode: "default" | "disabled" });
export type ButtonInventoryChange = { action: "learn"; button: string } | { action: "reset" };

export interface DesktopService {
  status(): Promise<BackendStatus>;
  launcherCatalog(): Promise<LauncherRelease[]>;
  list(): Promise<SavedTv[]>;
  discover(): Promise<TvCandidate[]>;
  connect(host: string, profileId?: string): Promise<SavedTv>;
  listApps(id: string, signal: AbortSignal): Promise<TvAppPackage[]>;
  listButtons(id: string, signal: AbortSignal): Promise<ButtonMappings>;
  buttonActions?: {
    listApps(id: string, signal: AbortSignal): Promise<ButtonTargetApp[]>;
    change(id: string, change: ButtonChange): Promise<TvButtonMapping>;
    updateInventory(id: string, change: ButtonInventoryChange): Promise<true>;
  };
  removeApps(id: string, packages: AppPackageSelection[]): Promise<AppRemovalResult>;
  installLauncher(
    id: string,
    version: string,
    currentVersion: string | null,
    confirmReplace: boolean,
  ): Promise<SavedTv>;
  prepareNativeHome(id: string): Promise<PreparedHomeApply>;
  /** Verify the prepared backup revision before changing any TV settings. */
  applyNativeHome?(id: string, backupSha256: string): Promise<SavedTv>;
  readHomeBackup?(id: string, capturedAt: string): Promise<HomeBackupSettings>;
  /** Resolve with the current TV profile after verifying the restored settings. */
  restoreHomeBackup?(id: string, capturedAt: string): Promise<SavedTv>;
  rename(id: string, name: string): Promise<void>;
  forget(id: string): Promise<void>;
}

export function canApplyNativeHome(profile: SavedTv): boolean {
  return (
    profile.launcher_version !== null &&
    (profile.home_routing_mode === "watcher" || profile.home_routing_mode === undefined) &&
    profile.home_backup?.status !== "unreadable"
  );
}

export type TvPage = "overview" | "launcher" | "apps" | "home" | "buttons";

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "This action could not finish. Please retry.";
}

export function validHost(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  return parts[0] !== "0" && Number(parts[0]) < 224 && value.trim() !== "255.255.255.255";
}
