import type { DesktopService, LauncherRelease, SavedTv, TvAppPackage } from "../contracts";

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
};

export const office: SavedTv = {
  ...bedroom,
  id: "3".repeat(64),
  identity_sha256: "3".repeat(64),
  host: "192.0.2.22",
  name: "Office",
};

export const testReleases: LauncherRelease[] = [
  { version: "3.1.0", sections: [{ heading: "Features", changes: ["Add a clock setting."] }] },
  { version: "3.0.0", sections: [] },
  { version: "2.7.0", sections: [{ heading: "Bug Fixes", changes: ["Fix app card spacing."] }] },
];
export const testStatus = { name: "aerotizen-desktop-worker", version: "3.0.1", operations: [] };
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
    rename: async (id, name) => {
      const tv = profiles.get(id);
      if (tv) profiles.set(id, { ...tv, name });
    },
    forget: async (id) => {
      profiles.delete(id);
    },
  };
}
