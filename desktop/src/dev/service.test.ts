import { describe, expect, it, vi } from "vitest";
import { createScenario, createTv, sampleReleases, TV_PRESETS } from "./scenarios";
import { createSimulatorService } from "./service";
import { createSimulatorStore, parseScenario, SIMULATOR_STORAGE_KEY } from "./store";

function setup() {
  const initial = { ...createScenario(), release_source: "custom" as const, releases: sampleReleases(), delay_ms: 0 };
  const store = createSimulatorStore(localStorage, initial);
  return { store, service: createSimulatorService(store), initial };
}
const signal = () => new AbortController().signal;

describe("TV simulator", () => {
  it("persists all presets and validates imported identities, addresses, inventories and versions", () => {
    const { store, initial } = setup();
    for (const [index, preset] of Object.keys(TV_PRESETS).entries()) {
      const state = { ...initial, tvs: [createTv(preset as keyof typeof TV_PRESETS, index)] };
      store.replace(state);
      expect(createSimulatorStore(localStorage).getSnapshot()).toEqual(store.getSnapshot());
    }
    const tv = initial.tvs[0]!;
    for (const copy of [
      {
        ...initial,
        tvs: initial.tvs.map((entry) => ({ ...entry, profile: { ...entry.profile, host: tv.profile.host } })),
      },
      { ...initial, tvs: initial.tvs.map((entry) => ({ ...entry, profile: { ...entry.profile, id: tv.profile.id } })) },
      { ...initial, tvs: [{ ...tv, profile: { ...tv.profile, launcher_version: "tomorrow" } }] },
      { ...initial, tvs: [{ ...tv, apps: tv.apps.map((app) => ({ ...app, revision: "invalid" })) }] },
    ]) {
      expect(() => parseScenario(JSON.stringify(copy))).toThrow();
    }
    const snapshot = store.getSnapshot();
    expect(() => store.replace({ ...initial, schema_version: 2 } as never)).toThrow("schema version");
    expect(store.getSnapshot()).toBe(snapshot);
  });

  it("recovers from corrupt storage and keeps running when persistence is unavailable", async () => {
    localStorage.setItem(SIMULATOR_STORAGE_KEY, "broken JSON");
    const store = createSimulatorStore(localStorage);
    expect(store.getSnapshot().tvs).toHaveLength(3);
    expect(store.getWarning()).toContain("could not be loaded");
    const failing = createSimulatorStore({
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage full");
      },
    });
    failing.update((state) => ({ ...state, delay_ms: 0 }));
    expect(await createSimulatorService(failing).list()).toHaveLength(2);
    expect(failing.getWarning()).toContain("will not survive a reload");
  });

  it("defaults existing scenarios to GitHub and keeps explicit custom catalogues offline", async () => {
    const { initial } = setup();
    const legacy: Record<string, unknown> = { ...initial };
    delete legacy.release_source;
    expect(parseScenario(JSON.stringify(legacy)).release_source).toBe("github");
    const store = createSimulatorStore(undefined, initial);
    const load = vi.fn();
    expect(await createSimulatorService(store, load).launcherCatalog()).toEqual(initial.releases);
    expect(load).not.toHaveBeenCalled();
  });

  it("uses live catalogue versions for simulated installation and does not fall back on errors", async () => {
    const store = createSimulatorStore(undefined, { ...createScenario(), delay_ms: 0 });
    const live = [{ version: "8.0.0", sections: [{ heading: "Features", changes: ["Published change."] }] }];
    const load = vi.fn().mockResolvedValue(live);
    const service = createSimulatorService(store, load);
    expect(await service.launcherCatalog()).toEqual(live);
    expect(store.getSnapshot().releases).toEqual([]);
    const tv = store.getSnapshot().tvs[0]!;
    expect(
      (await service.installLauncher(tv.profile.id, "8.0.0", tv.profile.launcher_version, false)).launcher_version,
    ).toBe("8.0.0");
    load.mockRejectedValueOnce(new Error("GitHub unavailable"));
    await expect(service.launcherCatalog()).rejects.toThrow("GitHub unavailable");
    expect(store.getSnapshot().release_source).toBe("github");
  });

  it("discards a live catalogue reply after the scenario changes", async () => {
    const store = createSimulatorStore(undefined, { ...createScenario(), delay_ms: 0 });
    let reply!: (releases: ReturnType<typeof sampleReleases>) => void;
    const load = vi.fn(
      () =>
        new Promise<ReturnType<typeof sampleReleases>>((resolve) => {
          reply = resolve;
        }),
    );
    const service = createSimulatorService(store, load);
    const reading = service.launcherCatalog();
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    const rejection = expect(reading).rejects.toMatchObject({ name: "AbortError" });
    store.replace({ ...store.getSnapshot() });
    reply(sampleReleases());
    await rejection;
    const tv = store.getSnapshot().tvs[0]!;
    await expect(service.installLauncher(tv.profile.id, "3.4.0", tv.profile.launcher_version, false)).rejects.toThrow(
      "available release",
    );
  });

  it("saves and forgets TVs independently of discovery and never exposes mutable stored profiles", async () => {
    const { store, service } = setup();
    const fresh = store.getSnapshot().tvs[1]!;
    expect(await service.list()).toHaveLength(2);
    expect(await service.discover()).toHaveLength(3);
    const profile = await service.connect(fresh.profile.host);
    profile.name = "Caller mutation";
    expect((await service.list()).find((tv) => tv.id === profile.id)?.name).toBe("Bedroom TV");
    await service.forget(profile.id);
    expect(await service.discover()).toHaveLength(3);
    expect(await service.list()).toHaveLength(2);
    await expect(service.connect(fresh.profile.host, store.getSnapshot().tvs[0]!.profile.id)).rejects.toThrow(
      "different TV",
    );
    store.update((state) => ({ ...state, tvs: state.tvs.map((tv) => ({ ...tv, online: false })) }));
    expect(await service.discover()).toEqual([]);
    await expect(service.connect(fresh.profile.host)).rejects.toThrow("offline");
  });

  it("fails only the selected next request and leaves cancelled failures armed", async () => {
    const { store, service } = setup();
    const id = store.getSnapshot().tvs[0]!.profile.id;
    store.update((state) => ({ ...state, delay_ms: 10, fail_next: { operation: "listApps", message: "TV busy" } }));
    expect(await service.list()).toHaveLength(2);
    const controller = new AbortController();
    const reading = service.listApps(id, controller.signal);
    const rejection = expect(reading).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    expect(store.getSnapshot().fail_next?.operation).toBe("listApps");
    await expect(service.listApps(id, signal())).rejects.toThrow("TV busy");
    expect(await service.listApps(id, signal())).not.toHaveLength(0);
    expect(store.getSnapshot().fail_next).toBeNull();
  });

  it("invalidates in-flight writes when a different scenario is loaded", async () => {
    vi.useFakeTimers();
    try {
      const { store, service } = setup();
      const tv = store.getSnapshot().tvs[0]!;
      store.update((state) => ({ ...state, delay_ms: 5_000 }));
      const install = service.installLauncher(tv.profile.id, "3.4.0", tv.profile.launcher_version, false);
      const rejection = expect(install).rejects.toMatchObject({ name: "AbortError" });
      store.replace(createScenario(true));
      await rejection;
      expect(store.getSnapshot().tvs).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks protected apps and revisions before removal and retains explicit TV refusals", async () => {
    const { store, service } = setup();
    const tv = store.getSnapshot().tvs[0]!;
    const removable = tv.apps.find((app) => app.name === "Stremio")!;
    const refused = tv.apps.find((app) => app.name === "BBC Sounds")!;
    const protectedApp = tv.apps.find((app) => app.protected)!;
    await expect(service.removeApps(tv.profile.id, [removable, protectedApp])).rejects.toThrow("protected");
    await expect(service.removeApps(tv.profile.id, [{ ...removable, revision: "stale" }])).rejects.toThrow("changed");
    expect(await service.listApps(tv.profile.id, signal())).toHaveLength(tv.apps.length);
    const result = await service.removeApps(tv.profile.id, [removable, refused]);
    expect(result.results).toEqual([
      { id: removable.id, status: "removed" },
      { id: refused.id, status: "refused" },
    ]);
    expect(result.apps?.map((app) => app.name)).toContain("BBC Sounds");
    expect(result.apps?.map((app) => app.name)).not.toContain("Stremio");
  });

  it("keeps the first Home backup across apply, restore and reload", async () => {
    const { store, service } = setup();
    const id = store.getSnapshot().tvs[2]!.profile.id;
    const backup = await service.prepareNativeHome(id);
    const original = await service.readHomeBackup!(id, backup.captured_at);
    await expect(service.readHomeBackup!(id, "")).rejects.toThrow("backup could not be verified");
    expect((await service.applyNativeHome!(id, backup.backup_sha256)).home_routing_mode).toBe("native");
    await service.restoreHomeBackup!(id, backup.captured_at);
    expect(await service.prepareNativeHome(id)).toEqual(backup);
    const reloaded = createSimulatorService(createSimulatorStore(localStorage));
    expect(await reloaded.readHomeBackup!(id, backup.captured_at)).toEqual(original);
    await expect(service.applyNativeHome!(id, "wrong revision")).rejects.toThrow("backup changed");
  });

  it("simulates sign-in and signing without losing certificates when signing out", async () => {
    const { store, service } = setup();
    const tv = store.getSnapshot().tvs[1]!;
    await expect(service.samsung!.prepareCertificates(tv.profile.id)).rejects.toThrow("Sign in");
    expect(await service.samsung!.signIn(signal())).toEqual({ email: "developer@example.test" });
    await service.samsung!.prepareCertificates(tv.profile.id);
    await service.samsung!.signOut();
    expect(await service.samsung!.account()).toBeNull();
    expect((await service.connect(tv.profile.host)).launcher_signing_ready).toBe(true);
  });

  it("keeps Root setup and updates pending until restart proof is checked", async () => {
    const { store, service } = setup();
    const fresh = store.getSnapshot().tvs[1]!;
    await service.samsung!.signIn(signal());
    await service.samsung!.prepareCertificates(fresh.profile.id);
    expect((await service.rootAccess!.setup(fresh.profile.id, "start")).phase).toBe("waiting_boot");
    expect((await service.rootAccess!.setup(fresh.profile.id, "verify")).setup_complete).toBe(false);
    await service.rootAccess!.simulateRestart!(fresh.profile.id);
    expect((await service.rootAccess!.status(fresh.profile.id, signal())).setup_complete).toBe(false);
    expect((await service.rootAccess!.setup(fresh.profile.id, "verify")).setup_complete).toBe(true);
    const older = store.getSnapshot().tvs[0]!;
    expect((await service.rootAccess!.upgrade(older.profile.id, "start")).update_pending).toBe(true);
    expect((await service.rootAccess!.upgrade(older.profile.id, "resume")).update_pending).toBe(true);
    await service.rootAccess!.simulateRestart!(older.profile.id);
    expect((await service.rootAccess!.upgrade(older.profile.id, "resume")).update_pending).toBe(false);
    expect(store.getSnapshot().tvs[0]!.original_home).toEqual(older.original_home);
  });

  it("resumes simulated root removal after reload and leaves the launcher and Home settings in place", async () => {
    const { store, service, initial } = setup();
    store.replace(initial);
    const tv = initial.tvs[0]!;
    expect(await service.rootAccess!.revealRecovery!(tv.profile.id)).toMatch(/simulator/i);
    const pending = await service.rootAccess!.remove!(tv.profile.id, "start");
    expect(pending).toMatchObject({ phase: "removing", removal_prepared: true, root_available: false });

    const reopened = createSimulatorStore(localStorage);
    const root = createSimulatorService(reopened).rootAccess!;
    await expect(root.remove!(tv.profile.id, "finish")).rejects.toThrow(/restart/i);
    await root.simulateRestart!(tv.profile.id);
    expect(await root.remove!(tv.profile.id, "finish")).toMatchObject({ phase: "removed", recovery_saved: true });
    const removed = reopened.getSnapshot().tvs[0]!;
    expect(removed.profile.launcher_version).toBe(tv.profile.launcher_version);
    expect(removed.profile.native_home_settings).toEqual(tv.profile.native_home_settings);
    expect(removed.profile.transport).toBe("developer");
  });

  it("isolates button changes by TV and supports learning, renaming and reset", async () => {
    const { store, service } = setup();
    const tv = createTv("rooted", 5);
    store.replace({ ...store.getSnapshot(), tvs: [...store.getSnapshot().tvs, tv] });
    const actions = service.buttonActions!;
    await actions.updateInventory(tv.profile.id, { action: "learn", button: "Music" });
    await actions.updateInventory(tv.profile.id, { action: "rename", button: "Music", new_name: "Radio" });
    const targets = await actions.listApps(tv.profile.id, signal());
    expect((await actions.change(tv.profile.id, { button: "Radio", mode: "app", app_id: targets[0]!.id })).active).toBe(
      false,
    );
    const mappings = await service.listButtons(tv.profile.id, signal());
    expect(mappings.status === "ready" && mappings.buttons.find((button) => button.button === "Radio")?.active).toBe(
      true,
    );
    const other = await service.listButtons(store.getSnapshot().tvs[0]!.profile.id, signal());
    expect(other.status === "ready" && other.buttons.some((button) => button.button === "Radio")).toBe(false);
    await actions.updateInventory(tv.profile.id, { action: "reset" });
    const reset = await service.listButtons(tv.profile.id, signal());
    expect(reset.status === "ready" && reset.buttons.every((button) => button.mode === "default")).toBe(true);
  });

  it("updates launcher and local app inventories and enforces downgrade confirmation", async () => {
    const { store, service } = setup();
    const tv = store.getSnapshot().tvs[0]!;
    await service.installLauncher(tv.profile.id, "3.4.0", "3.3.2", false);
    await expect(service.installLauncher(tv.profile.id, "3.3.0", "3.4.0", false)).rejects.toThrow(
      "Confirm the downgrade",
    );
    expect((await service.installLauncher(tv.profile.id, "3.3.0", "3.4.0", true)).launcher_version).toBe("3.3.0");
    const local = await service.localApps!.choose(tv.profile.id);
    expect(local?.replacing).toBe(false);
    await service.localApps!.install(tv.profile.id, local!.selection_id, true);
    expect(await service.localApps!.choose(tv.profile.id)).toMatchObject({ replacing: true, current_version: "1.0.0" });
    expect((await service.listApps(tv.profile.id, signal())).some((app) => app.name === "Sample Player")).toBe(true);
  });
});
