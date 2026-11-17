import { test as base } from "@playwright/test";
import type { AppPackageSelection, AppRemovalOutcome, SavedTv, TvAppPackage } from "../src/contracts";
import {
  bedroom,
  livingRoom,
  office,
  testBackupSettings,
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
      ({ initial, known, packages, failures, releases, status, backupSettings }) => {
        let currentPackages = packages;
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
                case "cancel_tv_app_list":
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
      },
    );
    await use(page);
  },
});
