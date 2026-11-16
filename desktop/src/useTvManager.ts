import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./contracts";
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
    async (message: string, action: () => Promise<void>, scope: PendingOperation["scope"] = "app") => {
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
        if (mounted.current) setError(errorMessage(caught));
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

  const installLauncher = (version: string, confirmReplace: boolean) => {
    if (!selected) return Promise.resolve(false);
    const { id } = selected;
    return run(`Installing AeroTizen ${version}…`, async () => {
      const updated = await service.installLauncher(id, version, selected.launcher_version, confirmReplace);
      if (!mounted.current) return;
      setProfiles((current) => current.map((profile) => (profile.id === id ? updated : profile)));
      setSelected((current) => (current?.id === id ? updated : current));
    });
  };

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
