import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./contracts";
import type { BackendStatus, DesktopService, LauncherRelease, SavedTv, TvCandidate } from "./contracts";

interface PendingOperation {
  message: string;
  scope: "app" | "discovery";
}

export function useTvManager(service: DesktopService) {
  const [profiles, setProfiles] = useState<SavedTv[]>([]);
  const [candidates, setCandidates] = useState<TvCandidate[] | null>(null);
  const [selected, setSelected] = useState<SavedTv | null>(null);
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [launcherReleases, setLauncherReleases] = useState<LauncherRelease[] | null>();
  const [releaseCheck, setReleaseCheck] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PendingOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const mounted = useRef(false);

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

  const run = useCallback(
    async (message: string, action: () => Promise<void>, scope: PendingOperation["scope"] = "app") => {
      if (active.current) return false;
      active.current = true;
      setBusy({ message, scope });
      setError(null);
      try {
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
    [],
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
    backend,
    latestLauncher: launcherReleases?.[0]?.version ?? (launcherReleases === undefined ? undefined : null),
    launcherReleases,
    loading,
    busy,
    error,
    ready: !loading && backend !== null,
    connect,
    discover,
    rename,
    forget,
    installLauncher,
    retryLauncherVersions: () => {
      setLauncherReleases(undefined);
      setReleaseCheck((current) => current + 1);
    },
    clearError: () => setError(null),
    back: () => {
      setError(null);
      setSelected(null);
    },
  };
}

export type TvManager = ReturnType<typeof useTvManager>;
