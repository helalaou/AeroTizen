import { test as base } from "@playwright/test";
import type { AppPackageSelection, AppRemovalOutcome, SavedTv, TvAppPackage } from "../src/contracts";
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
      }) => {
        let currentPackages = packages;
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
        Object.defineProperty(window, "__TAURI_INTERNALS__", {
          value: {
            async invoke(command: string, args: Record<string, unknown> = {}) {
              switch (command) {
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
                case "backend_status":
                  return status;
                case "launcher_catalog":
                  return releases;
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
                    ? buttonMappings
                    : { status: "pairing_required" };
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
                    !releases.some((item) => item.version === version)
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
      },
    );
    await use(page);
  },
});
