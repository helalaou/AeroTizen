import { canApplyNativeHome } from "../contracts";
import type {
  AppRemovalOutcome,
  ButtonTargetApp,
  DesktopService,
  LauncherRelease,
  SavedTv,
  TvButtonMapping,
} from "../contracts";
import { buttonNameExists, validButtonName } from "../services/buttonNames";
import { compareLauncherVersions } from "../services/launcherVersions";
import { AEROTIZEN_HOME, createIdentity, rootPreset, SIMULATOR_HELPER_VERSION, synchronizeRoot } from "./scenarios";
import type { SimulatedTv, SimulatorOperation } from "./scenarios";
import type { SimulatorStore } from "./store";
import { loadPublishedReleases } from "./releaseCatalog";

const SIMULATOR_ACCOUNT = { email: "developer@example.test" };
const SIMULATOR_COMPUTER_IP = "192.0.2.10";
function cancelled(): DOMException {
  return new DOMException("Simulator request cancelled.", "AbortError");
}
function delay(milliseconds: number, signals: readonly AbortSignal[]): Promise<void> {
  signals.forEach((signal) => signal.throwIfAborted());
  return new Promise((resolve, reject) => {
    const cleanup = () => signals.forEach((signal) => signal.removeEventListener("abort", cancel));
    const cancel = () => {
      clearTimeout(timer);
      cleanup();
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signals.forEach((signal) => signal.addEventListener("abort", cancel, { once: true }));
  });
}
function originalButton(button: string): TvButtonMapping {
  return { button, mode: "default", app_id: null, app_name: null, active: false };
}
function buttonApps(tv: SimulatedTv): ButtonTargetApp[] {
  return tv.apps.map((app) => ({ id: app.id === "DclHome001" ? "DclHome001.Home" : `${app.id}.App`, name: app.name }));
}

/** TV/account actions are local; only published release metadata can use a live service. */
export function createSimulatorService(store: SimulatorStore, loadReleases = loadPublishedReleases): DesktopService {
  let published: { generation: number; releases: LauncherRelease[] } | null = null;
  async function request<Result>(
    operation: SimulatorOperation,
    action: () => Result,
    signal?: AbortSignal,
  ): Promise<Result> {
    const generation = store.getGeneration();
    await delay(store.getSnapshot().delay_ms, [store.getRequestSignal(), ...(signal ? [signal] : [])]);
    signal?.throwIfAborted();
    if (generation !== store.getGeneration()) throw cancelled();
    const failure = store.getSnapshot().fail_next;
    if (failure?.operation === operation) {
      store.update((current) => ({ ...current, fail_next: null }));
      throw new Error(failure.message);
    }
    return structuredClone(action());
  }
  function known(id: string, requireOnline = true): SimulatedTv {
    const tv = store.getSnapshot().tvs.find((tv) => tv.profile.id === id);
    if (!tv) throw new Error("This simulated TV no longer exists.");
    if (requireOnline && !tv.online) throw new Error("Could not connect to the TV. The simulated TV is offline.");
    return tv;
  }
  function edit(id: string, change: (tv: SimulatedTv) => SimulatedTv, requireOnline = true): SimulatedTv {
    const updated = synchronizeRoot(change(known(id, requireOnline)));
    store.update((current) => ({ ...current, tvs: current.tvs.map((tv) => (tv.profile.id === id ? updated : tv)) }));
    return updated;
  }
  function rooted(id: string): SimulatedTv {
    const tv = known(id);
    if (!tv.root.root_available) throw new Error("This action needs verified root access.");
    return tv;
  }
  function buttons(id: string) {
    const tv = rooted(id);
    if (tv.buttons.status !== "ready") throw new Error("Update root access to edit button mappings.");
    return tv.buttons;
  }
  function withProfile(tv: SimulatedTv, change: Partial<SavedTv>): SimulatedTv {
    return { ...tv, profile: { ...tv.profile, ...change } };
  }
  function checkedBackup(id: string, capturedAt?: string): SimulatedTv {
    const tv = known(id);
    if (
      tv.profile.home_backup?.status !== "saved" ||
      (capturedAt !== undefined && tv.profile.home_backup.captured_at !== capturedAt)
    ) {
      throw new Error("The original Home backup could not be verified. Refresh the TV connection.");
    }
    return tv;
  }
  return {
    status: () => request("status", () => ({ version: SIMULATOR_HELPER_VERSION })),
    list: () =>
      request("list", () =>
        store
          .getSnapshot()
          .tvs.filter((tv) => tv.saved)
          .map((tv) => tv.profile),
      ),
    discover: () =>
      request("discover", () =>
        store
          .getSnapshot()
          .tvs.filter((tv) => tv.online && tv.discoverable)
          .map(({ profile }) => ({ host: profile.host, name: profile.name, model: profile.model })),
      ),
    connect: (host, profileId) =>
      request("connect", () => {
        const tv = store.getSnapshot().tvs.find((tv) => tv.profile.host === host);
        if (!tv) throw new Error("No simulated TV has this IP address. Add one in TV simulator.");
        if (profileId && profileId !== tv.profile.id)
          throw new Error("This address belongs to a different TV. No changes were made.");
        return edit(tv.profile.id, (current) => ({
          ...withProfile(current, {
            checked_at: new Date().toISOString(),
            computer_ip: SIMULATOR_COMPUTER_IP,
          }),
          saved: true,
        })).profile;
      }),
    rename: (id, name) =>
      request("rename", () => {
        edit(id, (tv) => withProfile(tv, { name }), false);
      }),
    forget: (id) =>
      request("forget", () => {
        edit(id, (tv) => ({ ...tv, saved: false }), false);
      }),
    launcherCatalog: async () => {
      const signal = store.getRequestSignal();
      const state = await request("launcherCatalog", () => ({
        source: store.getSnapshot().release_source,
        releases: store.getSnapshot().releases,
      }));
      signal.throwIfAborted();
      if (state.source === "custom") return state.releases;
      const releases = await loadReleases(signal);
      signal.throwIfAborted();
      published = { generation: store.getGeneration(), releases: structuredClone(releases) };
      return releases;
    },
    installLauncher: (id, version, currentVersion, confirmed) =>
      request("installLauncher", () => {
        const tv = known(id);
        if (!tv.profile.launcher_signing_ready) throw new Error("Prepare this TV's signing certificates first.");
        if (tv.profile.launcher_version !== currentVersion)
          throw new Error("The installed version changed. Refresh the TV.");
        const state = store.getSnapshot();
        let releases = state.releases;
        if (state.release_source === "github") {
          releases = published?.generation === store.getGeneration() ? published.releases : [];
        }
        if (!releases.some((release) => release.version === version)) throw new Error("Choose an available release.");
        if (currentVersion && (compareLauncherVersions(version, currentVersion) ?? 0) < 0 && !confirmed)
          throw new Error("Confirm the downgrade first.");
        return edit(id, (current) => ({
          ...withProfile(current, {
            launcher_version: version,
            home_routing_mode: current.profile.home_routing_mode ?? "watcher",
          }),
          apps: current.apps.some((app) => app.id === "DclHome001")
            ? current.apps
            : [
                {
                  id: "DclHome001",
                  name: "AeroTizen",
                  apps: ["AeroTizen"],
                  protected: true,
                  revision: createIdentity(),
                },
                ...current.apps,
              ],
        })).profile;
      }),
    listApps: (id, signal) => request("listApps", () => known(id).apps, signal),
    removeApps: (id, selections) =>
      request("removeApps", () => {
        const tv = known(id);
        for (const selection of selections) {
          const app = tv.apps.find((app) => app.id === selection.id);
          if (!app || app.revision !== selection.revision || app.protected)
            throw new Error("The app list changed or includes a protected app. Refresh and review the selection.");
        }
        const results: AppRemovalOutcome[] = selections.map(({ id }) => ({
          id,
          status: tv.removal_refusals.includes(id) ? "refused" : "removed",
        }));
        const removed = new Set(results.filter((result) => result.status === "removed").map((result) => result.id));
        const updated = edit(id, (current) => ({
          ...current,
          apps: current.apps.filter((app) => !removed.has(app.id)),
        }));
        return { apps: updated.apps, results };
      }),
    localApps: {
      choose: (id) =>
        request("chooseLocalApp", () => {
          const tv = known(id);
          const local = store.getSnapshot().local_app;
          const replacing = tv.apps.some((app) => app.id === local.package_id);
          return { ...local, replacing, current_version: replacing ? (tv.local_app_version ?? local.version) : null };
        }),
      install: (id, selectionId, confirmed) =>
        request("installLocalApp", () => {
          const tv = known(id);
          const local = store.getSnapshot().local_app;
          if (!confirmed || selectionId !== local.selection_id || !tv.profile.launcher_signing_ready)
            throw new Error("Review the local app and prepare this TV's signing certificates first.");
          const updated = edit(id, (current) => ({
            ...current,
            local_app_version: local.version,
            apps: [
              ...current.apps.filter((app) => app.id !== local.package_id),
              {
                id: local.package_id,
                name: local.name,
                apps: [local.name],
                protected: false,
                revision: createIdentity(),
              },
            ],
          }));
          return { profile: updated.profile, app_id: local.app_id, version: local.version };
        }),
    },
    samsung: {
      account: () => request("account", () => (store.getSnapshot().signed_in ? SIMULATOR_ACCOUNT : null)),
      signIn: (signal) =>
        request(
          "signIn",
          () => {
            store.update((current) => ({ ...current, signed_in: true }));
            return SIMULATOR_ACCOUNT;
          },
          signal,
        ),
      signOut: () =>
        request("signOut", () => {
          store.update((current) => ({ ...current, signed_in: false }));
        }),
      prepareCertificates: (id) =>
        request("certificates", () => {
          const tv = known(id);
          if (!tv.profile.launcher_signing_ready && !store.getSnapshot().signed_in)
            throw new Error("Sign in to Samsung to prepare signing certificates.");
          edit(id, (current) => withProfile(current, { launcher_signing_ready: true }));
          return { identity_sha256: tv.profile.identity_sha256, launcher_signing_ready: true };
        }),
    },
    prepareNativeHome: (id) =>
      request("prepareNativeHome", () => {
        const tv = known(id);
        if (!canApplyNativeHome(tv.profile)) throw new Error("Native Home is unavailable for this TV.");
        if (tv.profile.home_backup?.status === "saved")
          return { id, captured_at: tv.profile.home_backup.captured_at, backup_sha256: tv.backup_revision };
        const captured_at = new Date().toISOString();
        const updated = edit(id, (current) => ({
          ...withProfile(current, { home_backup: { status: "saved", captured_at } }),
          original_home: { ...current.original_home, ...current.profile.native_home_settings },
          backup_revision: createIdentity(),
        }));
        return { id, captured_at, backup_sha256: updated.backup_revision };
      }),
    readHomeBackup: (id, capturedAt) => request("readHomeBackup", () => checkedBackup(id, capturedAt).original_home),
    applyNativeHome: (id, backupSha256) =>
      request("applyNativeHome", () => {
        const tv = checkedBackup(id);
        if (tv.backup_revision !== backupSha256)
          throw new Error("The original backup changed. Review it before applying.");
        return edit(id, (current) =>
          withProfile(current, { home_routing_mode: "native", native_home_settings: { ...AEROTIZEN_HOME } }),
        ).profile;
      }),
    restoreHomeBackup: (id, capturedAt) =>
      request("restoreHomeBackup", () => {
        const tv = checkedBackup(id, capturedAt);
        return edit(id, (current) =>
          withProfile(current, {
            home_routing_mode: current.profile.launcher_version ? "watcher" : undefined,
            native_home_settings: { ...tv.original_home },
          }),
        ).profile;
      }),
    listButtons: (id, signal) =>
      request(
        "listButtons",
        () => {
          const tv = known(id);
          if (!tv.root.root_available) return { status: "pairing_required" };
          if (tv.buttons.status !== "ready") return tv.buttons;
          const mappings = {
            ...tv.buttons,
            buttons: tv.buttons.buttons.map((button) => ({ ...button, active: button.mode !== "default" })),
          };
          edit(id, (current) => ({ ...current, buttons: mappings }));
          return mappings;
        },
        signal,
      ),
    buttonActions: {
      listApps: (id, signal) => request("listButtonApps", () => buttonApps(rooted(id)), signal),
      change: (id, change) =>
        request("changeButton", () => {
          const mappings = buttons(id);
          if (!mappings.buttons.some((button) => button.button === change.button))
            throw new Error("The remote button is unavailable.");
          const app = change.mode === "app" ? buttonApps(known(id)).find((app) => app.id === change.app_id) : undefined;
          if (change.mode === "app" && !app) throw new Error("Choose an installed app.");
          const updated: TvButtonMapping = {
            button: change.button,
            mode: change.mode,
            app_id: app?.id ?? null,
            app_name: app?.name ?? null,
            active: false,
          };
          edit(id, (tv) => ({
            ...tv,
            buttons: {
              ...mappings,
              buttons: mappings.buttons.map((button) => (button.button === change.button ? updated : button)),
            },
          }));
          return updated;
        }),
      updateInventory: (id, change) =>
        request("updateButtonInventory", () => {
          const mappings = buttons(id);
          let next = mappings.buttons;
          if (change.action === "reset") {
            next = ["Disney+", "Netflix", "Prime Video", "Samsung TV Plus"].map(originalButton);
          } else {
            const name = change.action === "rename" ? change.new_name : change.button;
            if (
              !validButtonName(name) ||
              buttonNameExists(
                name,
                next.map((button) => button.button),
                change.action === "rename" ? change.button : undefined,
              )
            )
              throw new Error("Choose a unique valid button name.");
            if (change.action === "rename") {
              if (!next.some((button) => button.button === change.button))
                throw new Error("The remote button is unavailable.");
              if (
                (compareLauncherVersions(known(id).root.runtime_version ?? "0.0.0", SIMULATOR_HELPER_VERSION) ?? -1) < 0
              )
                throw new Error("Update root access to rename buttons.");
              next = next.map((button) => (button.button === change.button ? { ...button, button: name } : button));
            } else next = [...next, originalButton(name)];
          }
          edit(id, (tv) => ({ ...tv, buttons: { ...mappings, buttons: next } }));
          return true;
        }),
    },
    rootAccess: {
      revealRecovery: async () => "The simulator does not create local recovery files.",
      status: (id, signal) =>
        request(
          "rootStatus",
          () => {
            const root = known(id).root;
            const absent = !root.root_available && (root.phase === "not_configured" || root.phase === "removed");
            return { ...root, root_absence_verified: absent };
          },
          signal,
        ),
      setup: (id, action) =>
        request("rootSetup", () => {
          const tv = known(id);
          if (action === "start") {
            if (
              !tv.profile.launcher_signing_ready ||
              tv.root.phase === "active" ||
              tv.root.phase === "waiting_boot" ||
              tv.root.phase === "removing"
            )
              throw new Error("Review Root setup and signing certificates first.");
            return edit(id, (current) => ({ ...current, root: rootPreset("waiting") })).root;
          }
          if (tv.root.phase !== "waiting_boot" && tv.root.phase !== "active")
            throw new Error("There is no setup waiting for restart.");
          if (!tv.root.automatic_boot_verified || !tv.root.bootstrap_completed) return tv.root;
          return edit(id, (current) => ({ ...current, root: rootPreset("ready") })).root;
        }),
      upgrade: (id, action) =>
        request("rootUpdate", () => {
          const tv = rooted(id);
          if (action === "start") {
            if (!tv.profile.launcher_signing_ready || !tv.root.update_available || tv.root.update_pending)
              throw new Error("Review the update and original signing certificates first.");
            return edit(id, (current) => ({
              ...current,
              root: {
                ...current.root,
                update_pending: true,
                update_available: false,
                automatic_boot_verified: false,
                bootstrap_completed: false,
              },
            })).root;
          }
          if (!tv.root.update_pending) throw new Error("There is no pending Root update.");
          if (
            tv.root.runtime_version !== tv.root.target_runtime_version ||
            !tv.root.automatic_boot_verified ||
            !tv.root.bootstrap_completed
          )
            return tv.root;
          return edit(id, (current) => ({ ...current, root: rootPreset("ready") })).root;
        }),
      remove: (id, action) =>
        request("rootRemove", () => {
          const tv = known(id);
          if (tv.root.phase === "removed") return tv.root;
          if (action === "start") {
            if (tv.root.phase !== "active" || !tv.root.root_available || tv.root.update_pending)
              throw new Error("Root access must be ready before removal.");
            return edit(id, (current) => ({
              ...current,
              removal_restarted: false,
              root: {
                ...rootPreset("none"),
                phase: "removing",
                removal_prepared: true,
                recovery_saved: true,
              },
            })).root;
          }
          if (!tv.root.removal_prepared || !tv.removal_restarted)
            throw new Error("Restart the simulated TV before finishing removal.");
          return edit(id, (current) => ({
            ...current,
            removal_restarted: undefined,
            root: {
              ...rootPreset("none"),
              phase: "removed",
              recovery_saved: true,
              root_absence_verified: true,
            },
          })).root;
        }),
      simulateRestart: (id) =>
        request("restart", () => {
          edit(id, (tv) => ({
            ...tv,
            ...(tv.root.phase === "removing" && { removal_restarted: true }),
            root:
              tv.root.phase === "waiting_boot" || tv.root.update_pending
                ? {
                    ...tv.root,
                    root_available: true,
                    runtime_version: tv.root.target_runtime_version,
                    automatic_boot_verified: true,
                    bootstrap_completed: true,
                  }
                : tv.root,
          }));
        }),
    },
  };
}
