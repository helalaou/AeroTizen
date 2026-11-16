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

export interface DesktopService {
  status(): Promise<BackendStatus>;
  launcherCatalog(): Promise<LauncherRelease[]>;
  list(): Promise<SavedTv[]>;
  discover(): Promise<TvCandidate[]>;
  connect(host: string, profileId?: string): Promise<SavedTv>;
  installLauncher(
    id: string,
    version: string,
    currentVersion: string | null,
    confirmReplace: boolean,
  ): Promise<SavedTv>;
  rename(id: string, name: string): Promise<void>;
  forget(id: string): Promise<void>;
}

export type TvPage = "overview" | "launcher";

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
