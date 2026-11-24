import type {
  ButtonMappings,
  HomeBackupSettings,
  LauncherRelease,
  LocalAppPackage,
  RootAccessStatus,
  SavedTv,
  TvAppPackage,
} from "../contracts";

export const SIMULATOR_HELPER_VERSION = "3.1.1";
export const SIMULATOR_LAUNCHER_VERSION = "3.4.0";
export const DEFAULT_RESPONSE_DELAY_MS = 400;
export const MAX_RESPONSE_DELAY_MS = 30_000;
const SIMULATOR_ID_BYTES = 32;

/** getRandomValues also works on a phone's HTTP LAN preview. */
export function createIdentity(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(SIMULATOR_ID_BYTES)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export const ORIGINAL_HOME: HomeBackupSettings = {
  home_button_app: "com.samsung.tv.csfs",
  home_app: "com.samsung.tv.csfs",
  startup_app: "org.tizen.tv-viewer",
  startup_backup_app: "org.tizen.tv-viewer",
  smart_hub_autostart: false,
  first_screen: "com.samsung.tv.csfs",
};
export const AEROTIZEN_HOME: HomeBackupSettings = {
  home_button_app: "DclHome001.Home",
  home_app: "DclHome001.Home",
  startup_app: "DclHome001.Home",
  startup_backup_app: "DclHome001.Home",
  smart_hub_autostart: true,
  first_screen: "DclHome001.Home",
};

export const OPERATIONS = {
  status: "Backend status",
  list: "Load saved TVs",
  discover: "Search for TVs",
  connect: "Connect to a TV",
  checkDiagnostics: "Run TV diagnostics",
  launcherCatalog: "Fetch launcher releases",
  installLauncher: "Install launcher",
  listApps: "Load apps",
  removeApps: "Remove apps",
  chooseLocalApp: "Choose local app",
  installLocalApp: "Install local app",
  listButtons: "Read button mappings",
  listButtonApps: "Load button target apps",
  changeButton: "Change button mapping",
  updateButtonInventory: "Learn, rename or reset buttons",
  readHomeBackup: "Read Home backup",
  prepareNativeHome: "Save original Home settings",
  applyNativeHome: "Apply Native Home",
  restoreHomeBackup: "Restore original Home settings",
  rootStatus: "Read Root status",
  rootSetup: "Set up Root",
  rootUpdate: "Update root access",
  rootRemove: "Remove root access",
  restart: "Simulate TV restart",
  account: "Read Samsung account",
  signIn: "Samsung sign-in",
  signOut: "Samsung sign-out",
  certificates: "Prepare signing certificates",
  rename: "Rename saved TV",
  forget: "Forget saved TV",
} as const;
export type SimulatorOperation = keyof typeof OPERATIONS;
export interface SimulatedTv {
  profile: SavedTv;
  saved: boolean;
  online: boolean;
  discoverable: boolean;
  root: RootAccessStatus;
  removal_restarted?: boolean;
  apps: TvAppPackage[];
  buttons: ButtonMappings;
  original_home: HomeBackupSettings;
  backup_revision: string;
  removal_refusals: string[];
  local_app_version: string | null;
}
export interface SimulatorState {
  schema_version: 1;
  tvs: SimulatedTv[];
  release_source: "github" | "custom";
  releases: LauncherRelease[];
  signed_in: boolean;
  delay_ms: number;
  fail_next: { operation: SimulatorOperation; message: string } | null;
  local_app: LocalAppPackage;
}
export const TV_PRESETS = {
  fresh: "New TV — no launcher or Root",
  watcher: "Launcher with Watcher — no Root",
  native: "Native Home — no Root",
  rooted: "Rooted — ready",
  updates: "Launcher and Root updates available",
  waiting: "Root setup awaiting restart",
  offline: "Saved TV — offline",
} as const;
export type TvPreset = keyof typeof TV_PRESETS;
export const ROOT_PRESETS = {
  none: "Not set up",
  ready: "Ready",
  outdated: "Update available",
  waiting: "Setup awaiting restart",
  updating: "Update awaiting restart",
} as const;
export type RootPreset = keyof typeof ROOT_PRESETS;

export function rootPreset(kind: RootPreset): RootAccessStatus {
  const active = kind === "ready" || kind === "outdated" || kind === "updating";
  return {
    phase: "not_configured",
    root_available: active,
    setup_complete: active,
    runtime_version: active ? SIMULATOR_HELPER_VERSION : null,
    target_runtime_version: SIMULATOR_HELPER_VERSION,
    update_available: kind === "outdated",
    update_pending: kind === "updating",
    automatic_startup: kind === "none" ? null : true,
    automatic_boot_verified: active && kind !== "updating",
    bootstrap_completed: active && kind !== "updating",
    recovery_saved: kind !== "none",
    original_pc_host: kind === "none" ? null : "192.0.2.10",
    ...(kind !== "none" && { phase: active ? "active" : "waiting_boot" }),
    ...((kind === "outdated" || kind === "updating") && { runtime_version: "3.0.9" }),
  };
}

export function rootPresetName(root: RootAccessStatus): RootPreset {
  if (root.update_pending) return "updating";
  if (root.phase === "waiting_boot") return "waiting";
  if (root.update_available) return "outdated";
  return root.root_available ? "ready" : "none";
}

export function createTv(preset: TvPreset, index: number, identity = createIdentity()): SimulatedTv {
  const rooted = preset === "rooted" || preset === "updates";
  const installed = preset !== "fresh" && preset !== "waiting";
  const root = rootPreset("none");
  const tv: SimulatedTv = {
    profile: {
      id: identity,
      identity_sha256: identity,
      host: `192.0.2.${index + 20}`,
      name: `Test TV ${index + 1}`,
      model: "QE65LS03DAUXXU",
      launcher_version: installed ? SIMULATOR_LAUNCHER_VERSION : null,
      launcher_signing_ready: installed || preset === "waiting",
      transport: "developer",
      developer_mode: "1",
      developer_host: "192.0.2.10",
      checked_at: new Date().toISOString(),
      technical_details: {
        model_code: "QE65LS03DAUXXU",
        tizen_version: "9.0",
        firmware_build: rooted ? "T-PTMDDEUC-0090-REL-202605141701" : null,
        architecture: "armv7",
        platform: "24_PTM",
        root_runtime_version: null,
      },
      home_backup: { status: "missing" },
      home_routing_mode: installed ? "watcher" : undefined,
    },
    saved: preset !== "fresh",
    online: preset !== "offline",
    discoverable: true,
    root,
    apps: [
      ...(installed
        ? [{ id: "DclHome001", name: "AeroTizen", apps: ["AeroTizen"], protected: true, revision: "a".repeat(64) }]
        : []),
      { id: "Stremio001", name: "Stremio", apps: ["Stremio"], protected: false, revision: "b".repeat(64) },
      { id: "BBCSounds1", name: "BBC Sounds", apps: ["BBC Sounds"], protected: false, revision: "c".repeat(64) },
      {
        id: "com.samsung.tv.SecurityCenter",
        name: "SecurityCenter",
        apps: ["SecurityCenter"],
        protected: true,
        revision: "d".repeat(64),
      },
      { id: "org.tizen.browser", name: "Internet", apps: ["Internet"], protected: true, revision: "e".repeat(64) },
    ],
    buttons: {
      status: "ready",
      discovery_detail: null,
      buttons: ["Disney+", "Netflix", "Prime Video", "Samsung TV Plus"].map((button) => ({
        button,
        mode: "default",
        app_id: null,
        app_name: null,
        active: false,
      })),
    },
    original_home: { ...ORIGINAL_HOME },
    backup_revision: "f".repeat(64),
    removal_refusals: ["BBCSounds1"],
    local_app_version: null,
  };
  if (rooted || preset === "native") {
    tv.profile.home_routing_mode = "native";
    tv.profile.home_backup = { status: "saved", captured_at: tv.profile.checked_at };
  }
  if (rooted) tv.profile.native_home_settings = { ...AEROTIZEN_HOME };
  if (preset === "updates") tv.profile.launcher_version = "3.3.2";
  if (preset === "rooted") tv.root = rootPreset("ready");
  if (preset === "updates") tv.root = rootPreset("outdated");
  if (preset === "waiting") tv.root = rootPreset("waiting");
  return synchronizeRoot(tv);
}

/** Keep the connected profile consistent with the simulated helper. */
export function synchronizeRoot(tv: SimulatedTv): SimulatedTv {
  return {
    ...tv,
    profile: {
      ...tv.profile,
      transport: tv.root.root_available ? "paired_root" : "developer",
      native_home_settings: tv.root.root_available
        ? (tv.profile.native_home_settings ?? { ...tv.original_home })
        : tv.profile.native_home_settings,
      technical_details: tv.profile.technical_details
        ? {
            ...tv.profile.technical_details,
            root_runtime_version: tv.root.root_available ? tv.root.runtime_version : null,
          }
        : undefined,
    },
  };
}

export function createScenario(empty = false): SimulatorState {
  const presets: TvPreset[] = ["updates", "fresh", "watcher"];
  const names = ["Lounge TV", "Bedroom TV", "Office TV"];
  return {
    schema_version: 1,
    tvs: empty
      ? []
      : presets.map((preset, index) => {
          const tv = createTv(preset, index, String(index + 1).repeat(64));
          return { ...tv, profile: { ...tv.profile, name: names[index]! } };
        }),
    release_source: "github",
    releases: [],
    signed_in: false,
    delay_ms: DEFAULT_RESPONSE_DELAY_MS,
    fail_next: null,
    local_app: {
      selection_id: "9".repeat(64),
      name: "Sample Player",
      app_id: "SampleApp1.Player",
      package_id: "SampleApp1",
      version: "1.0.0",
      current_version: null,
      replacing: false,
    },
  };
}

/** Used only when explicitly requested for an offline scenario or deterministic tests. */
export function sampleReleases(): LauncherRelease[] {
  return [SIMULATOR_LAUNCHER_VERSION, "3.3.2", "3.3.0"].map((version) => ({
    version,
    sections: [{ heading: "Simulator release", changes: [`Sample release notes for AeroTizen ${version}.`] }],
  }));
}
