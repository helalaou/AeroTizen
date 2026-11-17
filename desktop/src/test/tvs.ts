import { canApplyNativeHome } from "../contracts";
import type {
  DesktopService,
  HomeBackupSettings,
  LauncherRelease,
  NativeHomeSettings,
  SavedTv,
  TvAppPackage,
} from "../contracts";

export const livingRoom: SavedTv = {
  id: "1".repeat(64),
  identity_sha256: "1".repeat(64),
  host: "192.0.2.20",
  name: "Living room",
  model: "QE65LS03DAUXXU",
  launcher_version: "3.0.0",
  launcher_signing_ready: true,
  transport: "paired_root",
  developer_mode: "1",
  developer_host: "192.0.2.10",
  checked_at: "2026-11-16T10:00:00Z",
  technical_details: {
    model_code: "QE65LS03DAUXXU",
    tizen_version: "9.0.0",
    architecture: "armv7",
    platform: "24_PTM",
    root_runtime_version: "3.0.1",
  },
  home_backup: { status: "saved", captured_at: "2026-11-16T10:00:00Z" },
  home_routing_mode: "native",
  native_home_settings: {
    home_button_app: "DclHome001.Home",
    home_app: "com.samsung.tv.csfs",
    startup_app: null,
    startup_backup_app: "org.tizen.tv-viewer",
    smart_hub_autostart: false,
  },
};

export const bedroom: SavedTv = {
  ...livingRoom,
  id: "2".repeat(64),
  identity_sha256: "2".repeat(64),
  host: "192.0.2.21",
  name: "Bedroom",
  launcher_version: null,
  transport: "developer",
  home_backup: { status: "missing" },
  home_routing_mode: undefined,
  native_home_settings: undefined,
};

export const office: SavedTv = {
  ...bedroom,
  id: "3".repeat(64),
  identity_sha256: "3".repeat(64),
  host: "192.0.2.22",
  name: "Office",
  launcher_version: "3.1.0",
  home_routing_mode: "watcher",
};

export const testReleases: LauncherRelease[] = [
  { version: "3.1.0", sections: [{ heading: "Features", changes: ["Add a clock setting."] }] },
  { version: "3.0.0", sections: [] },
  { version: "2.7.0", sections: [{ heading: "Bug Fixes", changes: ["Fix app card spacing."] }] },
];
export const testStatus = { name: "aerotizen-desktop-worker", version: "3.0.1", operations: [] };
export const testBackupSettings: HomeBackupSettings = {
  home_button_app: "com.samsung.tv.csfs",
  home_app: "com.samsung.tv.csfs",
  startup_app: "org.tizen.tv-viewer",
  startup_backup_app: "org.tizen.tv-viewer",
  first_screen: "com.samsung.tv.csfs",
  smart_hub_autostart: false,
};
export const testPackages: TvAppPackage[] = [
  { id: "DclHome001", name: "AeroTizen", apps: ["AeroTizen"], protected: true, revision: "1".repeat(64) },
  {
    id: "Abcdefghij",
    name: "Player",
    apps: ["Player", "Media Companion"],
    protected: false,
    revision: "2".repeat(64),
  },
  {
    id: "com.samsung.tv.SecurityCenter",
    name: "SecurityCenter",
    apps: ["SecurityCenter"],
    protected: true,
    revision: "3".repeat(64),
  },
];

export function testService(): DesktopService {
  const profiles = new Map([livingRoom, bedroom].map((tv) => [tv.id, tv]));
  const originalSettings = new Map<string, NativeHomeSettings>([[livingRoom.id, testBackupSettings]]);
  return {
    status: async () => testStatus,
    launcherCatalog: async () => testReleases,
    list: async () => [...profiles.values()],
    discover: async () => [livingRoom, bedroom, office],
    listApps: async () => testPackages,
    removeApps: async () => {
      throw new Error("Set the removal result in the test.");
    },
    connect: async (host, id) => {
      const tv = [livingRoom, bedroom, office].find((known) => known.host === host);
      if (!tv) throw new Error("Could not connect to the TV.");
      if (id && tv.id !== id) throw new Error("This address belongs to a different TV. No changes were made.");
      const connected = profiles.get(tv.id) ?? tv;
      profiles.set(tv.id, connected);
      return connected;
    },
    installLauncher: async () => {
      throw new Error("Set the install result in the test.");
    },
    applyNativeHome: async (id) => {
      const tv = profiles.get(id);
      if (!tv || !canApplyNativeHome(tv)) throw new Error("Native Home is unavailable for this TV.");
      const backup = tv.home_backup;
      if (backup?.status !== "saved" && tv.native_home_settings) {
        originalSettings.set(id, tv.native_home_settings);
      }
      const updated: SavedTv = {
        ...tv,
        home_backup: backup?.status === "saved" ? backup : { status: "saved", captured_at: new Date().toISOString() },
        home_routing_mode: "native",
        native_home_settings:
          tv.transport === "paired_root"
            ? {
                home_button_app: "DclHome001.Home",
                home_app: "DclHome001.Home",
                startup_app: "DclHome001.Home",
                startup_backup_app: "DclHome001.Home",
                smart_hub_autostart: true,
              }
            : undefined,
      };
      profiles.set(id, updated);
      return updated;
    },
    readHomeBackup: async (id, capturedAt) => {
      const backup = profiles.get(id)?.home_backup;
      if (backup?.status !== "saved" || backup.captured_at !== capturedAt) {
        throw new Error("The original Home backup could not be verified.");
      }
      return { ...testBackupSettings, ...originalSettings.get(id) };
    },
    restoreHomeBackup: async (id, capturedAt) => {
      const tv = profiles.get(id);
      if (tv?.home_backup?.status !== "saved" || tv.home_backup.captured_at !== capturedAt) {
        throw new Error("The original Home backup could not be verified.");
      }
      const updated: SavedTv = {
        ...tv,
        home_routing_mode: tv.launcher_version ? "watcher" : undefined,
        native_home_settings: originalSettings.get(id),
      };
      profiles.set(id, updated);
      return updated;
    },
    rename: async (id, name) => {
      const tv = profiles.get(id);
      if (tv) profiles.set(id, { ...tv, name });
    },
    forget: async (id) => {
      profiles.delete(id);
    },
  };
}
