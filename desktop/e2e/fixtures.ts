import { test as base } from "@playwright/test";
import type { SavedTv } from "../src/contracts";
import { bedroom, livingRoom, office, testReleases, testStatus } from "../src/test/tvs";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(
      ({ initial, known, releases, status }) => {
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
        releases: testReleases,
        status: testStatus,
      },
    );
    await use(page);
  },
});
