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
}

export type HomeBackup = { status: "saved"; captured_at: string } | { status: "missing" | "unreadable" };

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

export interface DesktopService {
  status(): Promise<BackendStatus>;
  launcherCatalog(): Promise<LauncherRelease[]>;
  list(): Promise<SavedTv[]>;
  discover(): Promise<TvCandidate[]>;
  connect(host: string, profileId?: string): Promise<SavedTv>;
  listApps(id: string, signal: AbortSignal): Promise<TvAppPackage[]>;
  removeApps(id: string, packages: AppPackageSelection[]): Promise<AppRemovalResult>;
  installLauncher(
    id: string,
    version: string,
    currentVersion: string | null,
    confirmReplace: boolean,
  ): Promise<SavedTv>;
  rename(id: string, name: string): Promise<void>;
  forget(id: string): Promise<void>;
}

export type TvPage = "overview" | "launcher" | "apps";

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
