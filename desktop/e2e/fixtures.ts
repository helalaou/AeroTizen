import { test as base } from "@playwright/test";
import type { AppPackageSelection, AppRemovalOutcome, RootAccessStatus, SavedTv, TvAppPackage } from "../src/contracts";
import {
  bedroom,
  livingRoom,
  office,
  testBackupSettings,
  testBackupSha256,
  testButtonApps,
  testButtonMappings,
  testPackages,
  testReleases,
  testStatus,
  testRootReady,
  testRootNotConfigured,
  testRootWaiting,
  testRootOutdated,
} from "../src/test/tvs";

export const test = base.extend<{
  inventory: { packages: TvAppPackage[]; failures?: Record<string, Omit<AppRemovalOutcome, "id">> };
}>({
  inventory: [{ packages: testPackages }, { option: true }],
  page: async ({ page, inventory }, use) => {
    await page.addInitScript(
      ({
        initial,
        known,
        packages,
        failures,
        releases,
        status,
        backupSettings,
        backupSha256,
        buttonApps,
        buttonMappings,
        rootReady,
        rootNotConfigured,
        rootWaiting,
        rootOutdated,
      }) => {
        let currentPackages = packages;
        let currentReleases = releases;
        const buttonKey = "test-button-mappings";
        let currentButtonMappings = JSON.parse(
          sessionStorage.getItem(buttonKey) ?? JSON.stringify(buttonMappings),
        ) as typeof buttonMappings;
        Object.defineProperty(window, "__setDemoReleases", {
          value: (next: typeof releases) => {
            currentReleases = next;
          },
        });
        let samsungAccount: { email: string } | null = null;
        const profileKey = "test-native-profiles";
        const profiles = new Map<string, SavedTv>(
          JSON.parse(sessionStorage.getItem(profileKey) ?? JSON.stringify(initial.map((tv) => [tv.id, tv]))),
        );
        const save = (tv: SavedTv) => {
          profiles.set(tv.id, tv);
          sessionStorage.setItem(profileKey, JSON.stringify([...profiles]));
          return tv;
        };
        const rootKey = "test-root-progress";
        const rootProgress = new Map<string, RootAccessStatus>(
          JSON.parse(
            sessionStorage.getItem(rootKey) ??
              JSON.stringify([
                [known[0]!.id, rootOutdated],
                [known[1]!.id, rootNotConfigured],
              ]),
          ),
        );
        const saveRoot = (id: string, value: RootAccessStatus) => {
          rootProgress.set(id, value);
          sessionStorage.setItem(rootKey, JSON.stringify([...rootProgress]));
          return value;
        };
        Object.defineProperty(window, "__restartDemoRoot", {
          value: (id: string) => {
            const current = rootProgress.get(id);
            if (!current || (current.phase !== "waiting_boot" && !current.update_pending))
              throw new Error("No pending root operation.");
            saveRoot(id, {
              ...current,
              runtime_version: current.target_runtime_version,
              automatic_boot_verified: true,
              bootstrap_completed: true,
            });
          },
        });
        Object.defineProperty(window, "__TAURI_INTERNALS__", {
          value: {
            async invoke(command: string, args: Record<string, unknown> = {}) {
              switch (command) {
                case "root_access_status":
                  if (!profiles.has(String(args.id))) throw new Error("Connect to the TV first.");
                  return structuredClone(rootProgress.get(String(args.id)) ?? rootNotConfigured);
                case "setup_root_access": {
                  const id = String(args.id);
                  const tv = profiles.get(id);
                  const current = rootProgress.get(id) ?? rootNotConfigured;
                  if (!tv || args.confirmed !== true) throw new Error("Confirm root setup first.");
                  if (args.action === "start") {
                    if (!tv.launcher_signing_ready || current.phase === "waiting_boot" || current.phase === "active")
                      throw new Error("Review root setup and signing certificates first.");
                    return saveRoot(id, { ...rootWaiting });
                  }
                  if (args.action !== "verify" || (current.phase !== "waiting_boot" && current.phase !== "active"))
                    throw new Error("There is no setup waiting for restart.");
                  if (!current.automatic_boot_verified || !current.bootstrap_completed) return structuredClone(current);
                  save({ ...tv, transport: "paired_root" });
                  return saveRoot(id, { ...rootReady });
                }
                case "upgrade_root_access": {
                  const id = String(args.id);
                  const tv = profiles.get(id);
                  const current = rootProgress.get(id);
                  if (!tv || args.confirmed !== true || current?.phase !== "active")
                    throw new Error("Confirm the update first.");
                  if (args.action === "start") {
                    if (!tv.launcher_signing_ready || !current.update_available)
                      throw new Error("Review update requirements first.");
                    return saveRoot(id, { ...current, update_available: false, update_pending: true });
                  }
                  if (args.action !== "resume" || !current.update_pending) throw new Error("No pending update.");
                  if (current.runtime_version !== current.target_runtime_version || !current.automatic_boot_verified)
                    return structuredClone(current);
                  save({
                    ...tv,
                    technical_details: { ...tv.technical_details!, root_runtime_version: rootReady.runtime_version },
                  });
                  return saveRoot(id, { ...rootReady });
                }
                case "samsung_account":
                  return samsungAccount;
                case "samsung_sign_in":
                  samsungAccount = { email: "demo@example.com" };
                  return samsungAccount;
                case "cancel_samsung_sign_in":
                  return;
                case "samsung_sign_out":
                  samsungAccount = null;
                  return;
                case "prepare_signing_profile": {
                  const tv = profiles.get(String(args.id));
                  if (!tv || (!samsungAccount && !tv.launcher_signing_ready)) throw new Error("Sign in to Samsung.");
                  save({ ...tv, launcher_signing_ready: true });
                  return { identity_sha256: tv.id, launcher_signing_ready: true };
                }
                case "desktop_status":
                  return status;
                case "launcher_catalog":
                  return currentReleases;
                case "list_tvs":
                  return [...profiles.values()];
                case "read_home_backup": {
                  const backup = profiles.get(String(args.id))?.home_backup;
                  if (backup?.status !== "saved" || backup.captured_at !== args.capturedAt) {
                    throw new Error("The original Home backup could not be verified.");
                  }
                  return backupSettings;
                }
                case "prepare_native_home": {
                  const tv = profiles.get(String(args.id));
                  if (!tv) throw new Error("Could not connect to the TV.");
                  const backup = tv.home_backup;
                  if (backup?.status === "saved") {
                    return { id: tv.id, captured_at: backup.captured_at, backup_sha256: backupSha256 };
                  }
                  const captured_at = new Date().toISOString();
                  save({ ...tv, home_backup: { status: "saved", captured_at } });
                  return { id: tv.id, captured_at, backup_sha256: backupSha256 };
                }
                case "apply_native_home": {
                  const tv = profiles.get(String(args.id));
                  if (!tv || tv.home_backup?.status !== "saved" || args.backupSha256 !== backupSha256) {
                    throw new Error("The original Home backup could not be verified.");
                  }
                  return save({
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
                  });
                }
                case "restore_home_backup": {
                  const tv = profiles.get(String(args.id));
                  const backup = tv?.home_backup;
                  if (!tv || backup?.status !== "saved" || backup.captured_at !== args.capturedAt) {
                    throw new Error("The backup changed. Refresh the TV connection to review it.");
                  }
                  return save({
                    ...tv,
                    home_routing_mode: tv.launcher_version ? "watcher" : undefined,
                    native_home_settings: {
                      home_button_app: backupSettings.home_button_app,
                      home_app: backupSettings.home_app,
                      startup_app: backupSettings.startup_app,
                      startup_backup_app: backupSettings.startup_backup_app,
                      smart_hub_autostart: backupSettings.smart_hub_autostart,
                    },
                  });
                }
                case "list_tv_apps":
                  if (!profiles.has(String(args.id))) throw new Error("Connect to the TV first.");
                  return structuredClone(currentPackages);
                case "list_tv_buttons":
                  return profiles.get(String(args.id))?.transport === "paired_root"
                    ? currentButtonMappings
                    : { status: "pairing_required" };
                case "change_tv_button": {
                  const change = args.change as { action: string; button: string; new_name: string };
                  if (profiles.get(String(args.id))?.transport !== "paired_root" || change.action !== "rename")
                    throw new Error("A paired TV helper is required.");
                  const current = currentButtonMappings.buttons.find((row) => row.button === change.button);
                  if (!current) throw new Error("The remote button is unavailable.");
                  if (
                    currentButtonMappings.buttons.some(
                      (row) => row !== current && row.button.toLowerCase() === change.new_name.toLowerCase(),
                    )
                  )
                    throw new Error("A button already has this name.");
                  currentButtonMappings = {
                    ...currentButtonMappings,
                    buttons: currentButtonMappings.buttons.map((row) =>
                      row === current ? { ...row, button: change.new_name } : row,
                    ),
                  };
                  sessionStorage.setItem(buttonKey, JSON.stringify(currentButtonMappings));
                  return true;
                }
                case "list_tv_button_apps":
                  return buttonApps;
                case "cancel_tv_read":
                  return;
                case "remove_tv_apps": {
                  if (!profiles.has(String(args.id))) throw new Error("Connect to the TV first.");
                  const selected = args.packages as AppPackageSelection[];
                  for (const item of selected) {
                    const current = currentPackages.find((candidate) => candidate.id === item.id);
                    if (!current || current.protected || current.revision !== item.revision) {
                      throw new Error("Review the installed apps again.");
                    }
                  }
                  const removed = new Set(
                    selected.filter(({ id }) => !Object.hasOwn(failures, id)).map(({ id }) => id),
                  );
                  currentPackages = currentPackages.filter((item) => !removed.has(item.id));
                  return {
                    apps: structuredClone(currentPackages),
                    results: selected.map(({ id }) => ({ id, ...(failures[id] ?? { status: "removed" }) })),
                  };
                }
                case "discover_tvs":
                  await new Promise((resolve) => setTimeout(resolve, 350));
                  return known;
                case "connect_tv": {
                  await new Promise((resolve) => setTimeout(resolve, 350));
                  const tv = known.find((item) => item.host === args.host);
                  if (!tv) throw new Error("Could not connect to the TV.");
                  if (args.profileId && tv.id !== args.profileId) {
                    throw new Error("This address belongs to a different TV. No changes were made.");
                  }
                  return save(profiles.get(tv.id) ?? tv);
                }
                case "forget_tv":
                  profiles.delete(String(args.id));
                  sessionStorage.setItem(profileKey, JSON.stringify([...profiles]));
                  return;
                case "install_launcher": {
                  const tv = profiles.get(String(args.id));
                  const version = String(args.version);
                  if (
                    !tv ||
                    tv.launcher_version !== args.currentVersion ||
                    !currentReleases.some((item) => item.version === version)
                  ) {
                    throw new Error("Refresh the TV and try again.");
                  }
                  if (version === "2.7.0" && !args.confirmReplace) throw new Error("Confirm downgrade first.");
                  return save({ ...tv, launcher_version: version });
                }
                default:
                  throw new Error(`Unexpected command ${command}`);
              }
            },
          },
        });
      },
      {
        initial: [livingRoom, bedroom],
        known: [livingRoom, bedroom, office],
        packages: inventory.packages,
        failures: inventory.failures ?? {},
        releases: testReleases,
        status: testStatus,
        backupSettings: testBackupSettings,
        buttonMappings: testButtonMappings,
        buttonApps: testButtonApps,
        backupSha256: testBackupSha256,
        rootReady: testRootReady,
        rootNotConfigured: testRootNotConfigured,
        rootWaiting: testRootWaiting,
        rootOutdated: testRootOutdated,
      },
    );
    await use(page);
  },
});
