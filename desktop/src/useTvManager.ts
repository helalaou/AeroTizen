import { useCallback, useEffect, useRef, useState } from "react";
import { canApplyNativeHome, errorMessage } from "./contracts";
import type {
  BackendStatus,
  DesktopService,
  LauncherRelease,
  NamedAppRemovalOutcome,
  SavedTv,
  TvAppPackage,
  TvCandidate,
} from "./contracts";

interface PendingOperation {
  message: string;
  scope: "app" | "discovery";
}

export function useTvManager(service: DesktopService) {
  const [profiles, setProfiles] = useState<SavedTv[]>([]);
  const [candidates, setCandidates] = useState<TvCandidate[] | null>(null);
  const [selected, setSelected] = useState<SavedTv | null>(null);
  const [apps, setApps] = useState<TvAppPackage[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appRemoval, setAppRemoval] = useState<NamedAppRemovalOutcome[]>([]);
  const [appRefusals, setAppRefusals] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [launcherReleases, setLauncherReleases] = useState<LauncherRelease[] | null>();
  const [releaseCheck, setReleaseCheck] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PendingOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const appList = useRef<{ controller: AbortController; completion: Promise<void> } | null>(null);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void Promise.allSettled([service.list(), service.status()]).then(([saved, status]) => {
      if (cancelled) return;
      if (saved.status === "fulfilled") setProfiles(saved.value);
      else setError(errorMessage(saved.reason));
      if (status.status === "fulfilled") setBackend(status.value);
      else setError(errorMessage(status.reason));
      setLoading(false);
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      appList.current?.controller.abort();
    };
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    void service.launcherCatalog().then(
      (releases) => {
        if (!cancelled) setLauncherReleases(releases);
      },
      () => {
        if (!cancelled) setLauncherReleases(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [service, releaseCheck]);

  const cancelAppLoad = useCallback(() => {
    const pending = appList.current;
    if (pending) {
      pending.controller.abort();
      setAppsLoading(false);
    }
    return pending?.completion;
  }, []);

  const run = useCallback(
    async (
      message: string,
      action: () => Promise<void>,
      scope: PendingOperation["scope"] = "app",
      reportError: (message: string) => void = setError,
    ) => {
      if (active.current) return false;
      active.current = true;
      setBusy({ message, scope });
      setError(null);
      try {
        const cancelling = cancelAppLoad();
        if (cancelling) await cancelling;
        await action();
        return true;
      } catch (caught) {
        if (mounted.current) reportError(errorMessage(caught));
        return false;
      } finally {
        active.current = false;
        if (mounted.current) setBusy(null);
      }
    },
    [cancelAppLoad],
  );

  const connect = (host: string, profileId?: string) =>
    run("Connecting…", async () => {
      let profile: SavedTv;
      try {
        profile = await service.connect(host, profileId);
      } catch (error) {
        if (mounted.current) setSelected((current) => (current?.id === profileId ? null : current));
        throw error;
      }
      if (!mounted.current) return;
      if (profile.id !== selected?.id) {
        setApps(null);
        setAppsError(null);
        setAppRemoval([]);
        setAppRefusals(new Map());
      }
      setProfiles((current) => [...current.filter((item) => item.id !== profile.id), profile]);
      setSelected(profile);
    });

  const discover = () =>
    run(
      "Searching your network…",
      async () => {
        const found = await service.discover();
        if (mounted.current) setCandidates(found);
      },
      "discovery",
    );

  const rename = (id: string, name: string) =>
    run("Saving TV name…", async () => {
      await service.rename(id, name);
      if (!mounted.current) return;
      const saved = await service.list();
      setProfiles(saved);
    });

  const forget = (id: string) =>
    run("Forgetting TV…", async () => {
      await service.forget(id);
      if (!mounted.current) return;
      setProfiles((current) => current.filter((profile) => profile.id !== id));
      setSelected((current) => (current?.id === id ? null : current));
    });

  const updateAppInventory = (inventory: TvAppPackage[] | null, refused: TvAppPackage[] = []) => {
    setApps(inventory);
    setAppRefusals((current) => {
      const observed = new Map(current);
      for (const { id, revision } of refused) observed.set(id, revision);
      if (!inventory) return observed;
      return new Map(
        inventory.filter(({ id, revision }) => observed.get(id) === revision).map(({ id, revision }) => [id, revision]),
      );
    });
  };

  const loadApps = (id: string) => {
    const previous = appList.current;
    if (active.current || (previous && !previous.controller.signal.aborted)) return;
    const controller = new AbortController();
    const { signal } = controller;
    setApps(null);
    setAppsError(null);
    setAppsLoading(true);
    const completion = (async () => {
      await previous?.completion;
      try {
        signal.throwIfAborted();
        const installed = await service.listApps(id, signal);
        if (mounted.current && !signal.aborted) updateAppInventory(installed);
      } catch (caught) {
        if (mounted.current && !signal.aborted) setAppsError(errorMessage(caught));
      } finally {
        if (appList.current?.controller === controller) {
          appList.current = null;
          if (mounted.current) setAppsLoading(false);
        }
      }
    })();
    appList.current = { controller, completion };
  };

  const removeApps = (id: string, picked: TvAppPackage[]) =>
    run("Removing apps…", async () => {
      setAppRemoval([]);
      setApps(null);
      const { apps: remaining, results } = await service.removeApps(
        id,
        picked.map(({ id, revision }) => ({ id, revision })),
      );
      if (!mounted.current) return;
      const resultById = new Map(results.map((result) => [result.id, result]));
      updateAppInventory(
        remaining,
        picked.filter(({ id }) => resultById.get(id)?.status === "refused"),
      );
      setAppRemoval(picked.map(({ id, name }) => ({ ...(resultById.get(id) ?? { id, status: "unverified" }), name })));
    });

  const updateProfile = (id: string, profile: SavedTv) => {
    if (!mounted.current) return;
    setProfiles((current) => current.map((item) => (item.id === id ? profile : item)));
    setSelected((current) => (current?.id === id ? profile : current));
  };

  const installLauncher = (version: string, confirmReplace: boolean) => {
    if (!selected) return Promise.resolve(false);
    const { id } = selected;
    return run(`Installing AeroTizen ${version}…`, async () => {
      const updated = await service.installLauncher(id, version, selected.launcher_version, confirmReplace);
      updateProfile(id, updated);
    });
  };

  const apply = service.applyNativeHome;
  const applyNativeHome = apply
    ? (id: string, reportError: (message: string) => void) =>
        run(
          "Applying Native Home…",
          async () => {
            if (selected?.id !== id || !canApplyNativeHome(selected)) {
              throw new Error("Native Home is unavailable for this TV. Refresh the connection and check its settings.");
            }
            const prepared = await service.prepareNativeHome(id);
            if (prepared.id !== id) throw new Error("Could not verify the backup for this TV.");
            updateProfile(id, { ...selected, home_backup: { status: "saved", captured_at: prepared.captured_at } });
            const updated = await apply(id, prepared.backup_sha256);
            if (
              updated.id !== id ||
              updated.home_routing_mode !== "native" ||
              updated.home_backup?.status !== "saved" ||
              updated.home_backup.captured_at !== prepared.captured_at
            ) {
              throw new Error("Could not verify Native Home and its original backup.");
            }
            updateProfile(id, updated);
          },
          "app",
          reportError,
        )
    : undefined;

  const restoreBackup = service.restoreHomeBackup;
  const restoreHomeBackup = restoreBackup
    ? (id: string, capturedAt: string, reportError: (message: string) => void) =>
        run(
          "Restoring Home backup…",
          async () => {
            const backup = selected?.home_backup;
            if (selected?.id !== id || backup?.status !== "saved" || backup.captured_at !== capturedAt) {
              throw new Error("The backup changed. Close this dialog and review the current backup.");
            }
            const updated = await restoreBackup(id, capturedAt);
            if (updated.id !== id) throw new Error("Could not verify the restored TV.");
            updateProfile(id, updated);
          },
          "app",
          reportError,
        )
    : undefined;

  return {
    profiles,
    candidates,
    selected,
    apps,
    appsLoading,
    appsError,
    appRemoval,
    appRefusals,
    backend,
    latestLauncher: launcherReleases?.[0]?.version ?? (launcherReleases === undefined ? undefined : null),
    launcherReleases,
    loading,
    busy,
    error,
    ready: !loading && backend !== null,
    connect,
    loadApps,
    cancelAppLoad,
    removeApps,
    discover,
    rename,
    forget,
    installLauncher,
    applyNativeHome,
    restoreHomeBackup,
    retryLauncherVersions: () => {
      setLauncherReleases(undefined);
      setReleaseCheck((current) => current + 1);
    },
    clearError: () => setError(null),
    clearAppRemoval: () => setAppRemoval([]),
    back: () => {
      cancelAppLoad();
      setError(null);
      setSelected(null);
      setApps(null);
      setAppsError(null);
      setAppRemoval([]);
      setAppRefusals(new Map());
    },
  };
}

export type TvManager = ReturnType<typeof useTvManager>;
