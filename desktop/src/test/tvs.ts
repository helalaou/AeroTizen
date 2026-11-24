import { canApplyNativeHome } from "../contracts";
import type {
  ButtonMappings,
  ButtonTargetApp,
  DesktopService,
  HomeBackupSettings,
  LauncherRelease,
  LocalAppPackage,
  NativeHomeSettings,
  RootAccessStatus,
  SavedTv,
  SamsungAccount,
  TvAppPackage,
  TvButtonMapping,
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
    root_runtime_version: "3.0.0",
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
  computer_ip: "192.0.2.11",
  launcher_version: null,
  launcher_signing_ready: false,
  technical_details: { ...livingRoom.technical_details!, root_runtime_version: null },
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
  launcher_signing_ready: true,
  home_routing_mode: "watcher",
};

export const testReleases: LauncherRelease[] = [
  { version: "3.1.0", sections: [{ heading: "Features", changes: ["Add a clock setting."] }] },
  { version: "3.0.0", sections: [] },
  { version: "2.7.0", sections: [{ heading: "Bug Fixes", changes: ["Fix app card spacing."] }] },
];
export const testStatus = { version: "3.0.1" };
export const testRootNotConfigured: RootAccessStatus = {
  phase: "not_configured",
  root_available: false,
  setup_complete: false,
  runtime_version: null,
  target_runtime_version: testStatus.version,
  update_available: false,
  update_pending: false,
  automatic_startup: null,
  automatic_boot_verified: false,
  bootstrap_completed: false,
  recovery_saved: false,
  original_pc_host: null,
};
export const testRootReady: RootAccessStatus = {
  phase: "active",
  root_available: true,
  setup_complete: true,
  runtime_version: "3.0.1",
  target_runtime_version: testStatus.version,
  update_available: false,
  update_pending: false,
  automatic_startup: true,
  automatic_boot_verified: true,
  bootstrap_completed: true,
  recovery_saved: true,
  original_pc_host: "192.0.2.10",
};
export const testRootWaiting: RootAccessStatus = {
  ...testRootReady,
  phase: "waiting_boot",
  setup_complete: false,
  automatic_boot_verified: false,
  bootstrap_completed: false,
};
export const testRootOutdated: RootAccessStatus = {
  ...testRootReady,
  runtime_version: "3.0.0",
  update_available: true,
};
export const testLocalApp: LocalAppPackage = {
  selection_id: "e".repeat(64),
  name: "Sample Player",
  app_id: "LocalApp01.Player",
  package_id: "LocalApp01",
  version: "1.2.0",
  current_version: null,
  replacing: false,
};
export const testBackupSettings: HomeBackupSettings = {
  home_button_app: "com.samsung.tv.csfs",
  home_app: "com.samsung.tv.csfs",
  startup_app: "org.tizen.tv-viewer",
  startup_backup_app: "org.tizen.tv-viewer",
  first_screen: "com.samsung.tv.csfs",
  smart_hub_autostart: false,
};
export const testBackupSha256 = "d".repeat(64);
export const testButtonMappings: Extract<ButtonMappings, { status: "ready" }> = {
  status: "ready",
  discovery_detail: null,
  buttons: [
    { button: "Disney+", mode: "disabled", app_id: null, app_name: null, active: false },
    { button: "Netflix", mode: "app", app_id: "test.Stremio", app_name: "Stremio", active: true },
    { button: "Prime Video", mode: "default", app_id: null, app_name: null, active: false },
  ],
};
export const testButtonApps: ButtonTargetApp[] = [
  { id: "DclHome001.Home", name: "AeroTizen" },
  { id: "test.Stremio", name: "Stremio" },
  { id: "test.YouTube", name: "YouTube" },
];
const SIMULATED_REMOTE_PRESS_DELAY_MS = 1_500;
const SIMULATED_SIGN_IN_DELAY_MS = 1_500;
const SIMULATED_CERTIFICATE_DELAY_MS = 700;
const SIMULATED_ROOT_SETUP_DELAY_MS = 1000;
const SIMULATED_BUTTON_ACTIVATION_DELAY_MS = 1500;

function originalButton(button: string): TvButtonMapping {
  return { button, mode: "default", app_id: null, app_name: null, active: false };
}
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
  let buttonMappings = testButtonMappings.buttons;
  const buttonActivationTimes = new Map<string, number>();
  let samsungAccount: SamsungAccount | null = null;
  const appInventories = new Map<string, TvAppPackage[]>();
  const rootProgress = new Map<string, RootAccessStatus>([
    [livingRoom.id, testRootOutdated],
    [bedroom.id, testRootNotConfigured],
    [office.id, { ...testRootNotConfigured, phase: "installed", recovery_saved: true, original_pc_host: "192.0.2.10" }],
  ]);
  return {
    rootAccess: {
      status: async (id, signal) => {
        signal.throwIfAborted();
        if (!profiles.has(id)) throw new Error("Connect to this TV first.");
        return { ...(rootProgress.get(id) ?? testRootNotConfigured) };
      },
      setup: async (id, action) => {
        const tv = profiles.get(id);
        if (!tv) throw new Error("Connect to this TV first.");
        const current = rootProgress.get(id) ?? testRootNotConfigured;
        if (current.phase === "removing") throw new Error("Finish root removal before starting setup.");
        if (action === "start") {
          if (!tv.launcher_signing_ready) throw new Error("Prepare this TV's signing certificates first.");
          if (current.phase === "waiting_boot" || current.phase === "active")
            throw new Error("Refresh Root access to continue the existing setup.");
          await new Promise((resolve) => setTimeout(resolve, SIMULATED_ROOT_SETUP_DELAY_MS));
          rootProgress.set(id, { ...testRootWaiting });
        } else {
          if (current.phase !== "waiting_boot" && current.phase !== "active")
            throw new Error("There is no setup waiting for restart.");
          if (current.automatic_boot_verified && current.bootstrap_completed) {
            rootProgress.set(id, { ...testRootReady });
            profiles.set(id, {
              ...tv,
              transport: "paired_root",
              launcher_signing_ready: true,
              technical_details: tv.technical_details
                ? { ...tv.technical_details, root_runtime_version: testRootReady.runtime_version }
                : undefined,
            });
          }
        }
        return { ...rootProgress.get(id)! };
      },
      simulateRestart: async (id) => {
        const status = rootProgress.get(id);
        if (!status || (status.phase !== "waiting_boot" && !status.update_pending))
          throw new Error("Start root setup or an update before simulating a restart.");
        rootProgress.set(id, {
          ...status,
          runtime_version: status.target_runtime_version,
          automatic_boot_verified: true,
          bootstrap_completed: true,
        });
      },
      upgrade: async (id, action) => {
        const tv = profiles.get(id);
        const current = rootProgress.get(id);
        if (!tv || !current || current.phase !== "active") throw new Error("Complete root setup first.");
        if (action === "start") {
          if (!tv.launcher_signing_ready) throw new Error("Restore the original signing certificates first.");
          if (!current.update_available || current.update_pending) throw new Error("Refresh Root access first.");
          await new Promise((resolve) => setTimeout(resolve, SIMULATED_ROOT_SETUP_DELAY_MS));
          rootProgress.set(id, { ...current, update_available: false, update_pending: true });
        } else {
          if (!current.update_pending) throw new Error("There is no pending root access update.");
          if (current.runtime_version === current.target_runtime_version && current.automatic_boot_verified) {
            rootProgress.set(id, { ...testRootReady });
            profiles.set(id, {
              ...tv,
              technical_details: tv.technical_details
                ? { ...tv.technical_details, root_runtime_version: testRootReady.runtime_version }
                : undefined,
            });
          }
        }
        return { ...rootProgress.get(id)! };
      },
    },
    localApps: {
      choose: async (id) => ({
        ...testLocalApp,
        replacing: appInventories.has(id),
        current_version: appInventories.has(id) ? testLocalApp.version : null,
      }),
      install: async (id, selectionId, confirmed) => {
        const profile = profiles.get(id);
        if (!profile?.launcher_signing_ready || selectionId !== testLocalApp.selection_id || !confirmed) {
          throw new Error("Review the app and prepare this TV's signing certificates first.");
        }
        await new Promise((resolve) => setTimeout(resolve, SIMULATED_CERTIFICATE_DELAY_MS));
        appInventories.set(id, [
          ...testPackages,
          {
            id: testLocalApp.package_id,
            name: testLocalApp.name,
            apps: [testLocalApp.name],
            protected: false,
            revision: testLocalApp.selection_id,
          },
        ]);
        return { profile, app_id: testLocalApp.app_id, version: testLocalApp.version };
      },
    },
    samsung: {
      account: async () => samsungAccount,
      signIn: async (signal) => {
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            reject(new DOMException("Sign-in cancelled.", "AbortError"));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", cancel);
            resolve();
          }, SIMULATED_SIGN_IN_DELAY_MS);
          signal.addEventListener("abort", cancel, { once: true });
        });
        signal.throwIfAborted();
        samsungAccount = { email: "demo@example.com" };
        return samsungAccount;
      },
      signOut: async () => {
        samsungAccount = null;
      },
      prepareCertificates: async (id) => {
        const profile = profiles.get(id);
        if (!profile) throw new Error("Connect to this TV first.");
        if (!profile.launcher_signing_ready && !samsungAccount)
          throw new Error("Sign in to Samsung to set up this TV.");
        await new Promise((resolve) => setTimeout(resolve, SIMULATED_CERTIFICATE_DELAY_MS));
        profiles.set(id, { ...profile, launcher_signing_ready: true });
        return { identity_sha256: id, launcher_signing_ready: true };
      },
    },
    status: async () => testStatus,
    launcherCatalog: async () => testReleases,
    list: async () => [...profiles.values()],
    discover: async () => [livingRoom, bedroom, office],
    listApps: async (id) => appInventories.get(id) ?? testPackages,
    listButtons: async (id) => {
      buttonMappings = buttonMappings.map((row) => {
        const readyAt = buttonActivationTimes.get(row.button);
        if (readyAt !== undefined && Date.now() >= readyAt) {
          buttonActivationTimes.delete(row.button);
          return { ...row, active: row.mode !== "default" };
        }
        return row;
      });
      return profiles.get(id)?.transport === "paired_root"
        ? { ...testButtonMappings, buttons: buttonMappings }
        : { status: "pairing_required" };
    },
    buttonActions: {
      listApps: async (id) => {
        if (profiles.get(id)?.transport !== "paired_root") throw new Error("A paired TV helper is required.");
        return testButtonApps;
      },
      change: async (id, change) => {
        if (
          profiles.get(id)?.transport !== "paired_root" ||
          !buttonMappings.some((row) => row.button === change.button)
        ) {
          throw new Error("The remote button is unavailable.");
        }
        const app = change.mode === "app" ? testButtonApps.find((app) => app.id === change.app_id) : undefined;
        if (change.mode === "app" && !app) throw new Error("Choose an installed app.");
        const updated: TvButtonMapping = {
          button: change.button,
          mode: change.mode,
          app_id: app?.id ?? null,
          app_name: app?.name ?? null,
          active: false,
        };
        if (change.mode === "default") buttonActivationTimes.delete(change.button);
        else buttonActivationTimes.set(change.button, Date.now() + SIMULATED_BUTTON_ACTIVATION_DELAY_MS);
        buttonMappings = buttonMappings.map((row) => (row.button === change.button ? updated : row));
        return updated;
      },
      updateInventory: async (id, change) => {
        if (profiles.get(id)?.transport !== "paired_root") throw new Error("A paired TV helper is required.");
        if (change.action === "learn") {
          await new Promise((resolve) => setTimeout(resolve, SIMULATED_REMOTE_PRESS_DELAY_MS));
          if (buttonMappings.some((row) => row.button.toLowerCase() === change.button.toLowerCase())) {
            throw new Error("A button already has this name.");
          }
          buttonMappings = [...buttonMappings, originalButton(change.button)].sort((a, b) =>
            a.button.localeCompare(b.button),
          );
        } else if (change.action === "rename") {
          const current = buttonMappings.find((row) => row.button === change.button);
          if (!current) throw new Error("The remote button is unavailable.");
          if (
            buttonMappings.some((row) => row !== current && row.button.toLowerCase() === change.new_name.toLowerCase())
          )
            throw new Error("A button already has this name.");
          buttonMappings = buttonMappings.map((row) => (row === current ? { ...row, button: change.new_name } : row));
          const readyAt = buttonActivationTimes.get(change.button);
          buttonActivationTimes.delete(change.button);
          if (readyAt !== undefined) buttonActivationTimes.set(change.new_name, readyAt);
        } else {
          buttonActivationTimes.clear();
          buttonMappings = testButtonMappings.buttons.map((row) => originalButton(row.button));
        }
        return true;
      },
    },
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
    installLauncher: async (id, version, currentVersion, confirmReplace) => {
      const profile = profiles.get(id);
      if (!profile || profile.launcher_version !== currentVersion || !profile.launcher_signing_ready) {
        throw new Error("Refresh the TV and check its signing certificates.");
      }
      if (!testReleases.some((release) => release.version === version)) throw new Error("Choose an available version.");
      if (version === "2.7.0" && !confirmReplace) throw new Error("Confirm the downgrade first.");
      const updated = { ...profile, launcher_version: version };
      profiles.set(id, updated);
      return updated;
    },
    prepareNativeHome: async (id) => {
      const tv = profiles.get(id);
      if (!tv || !canApplyNativeHome(tv)) throw new Error("Native Home is unavailable for this TV.");
      const backup = tv.home_backup;
      if (backup?.status === "saved") {
        return { id, captured_at: backup.captured_at, backup_sha256: testBackupSha256 };
      }
      if (tv.native_home_settings) originalSettings.set(id, tv.native_home_settings);
      const captured_at = new Date().toISOString();
      profiles.set(id, { ...tv, home_backup: { status: "saved", captured_at } });
      return { id, captured_at, backup_sha256: testBackupSha256 };
    },
    applyNativeHome: async (id, backupSha256) => {
      const tv = profiles.get(id);
      if (!tv || tv.home_backup?.status !== "saved" || backupSha256 !== testBackupSha256) {
        throw new Error("The original Home backup could not be verified.");
      }
      const updated: SavedTv = {
        ...tv,
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
