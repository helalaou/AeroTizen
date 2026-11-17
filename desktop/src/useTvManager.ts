import { useCallback, useEffect, useRef, useState } from "react";
import { canApplyNativeHome, errorMessage } from "./contracts";
import type {
  BackendStatus,
  ButtonChange,
  ButtonInventoryChange,
  ButtonMappings,
  ButtonTargetApp,
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
  const [buttonMappings, setButtonMappings] = useState<ButtonMappings | null>(null);
  const [buttonsLoading, setButtonsLoading] = useState(false);
  const [buttonsError, setButtonsError] = useState<string | null>(null);
  const [buttonChangeError, setButtonChangeError] = useState<string | null>(null);
  const [buttonApps, setButtonApps] = useState<ButtonTargetApp[] | null>(null);
  const [buttonAppsLoading, setButtonAppsLoading] = useState(false);
  const [buttonAppsError, setButtonAppsError] = useState<string | null>(null);
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
  const pageRead = useRef<{
    controller: AbortController;
    completion: Promise<void>;
    stopLoading: () => void;
  } | null>(null);

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
      pageRead.current?.controller.abort();
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

  const cancelPageRead = useCallback(() => {
    const pending = pageRead.current;
    if (pending) {
      pending.controller.abort();
      pending.stopLoading();
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
        const cancelling = cancelPageRead();
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
    [cancelPageRead],
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

  function loadPage<Result>(
    query: (signal: AbortSignal) => Promise<Result>,
    update: (result: Result | null) => void,
    showError: (error: string | null) => void,
    setLoading: (loading: boolean) => void,
  ) {
    const previous = pageRead.current;
    if (active.current || (previous && !previous.controller.signal.aborted)) return;
    const controller = new AbortController();
    const { signal } = controller;
    update(null);
    showError(null);
    setLoading(true);
    const stopLoading = () => setLoading(false);
    const completion = (async () => {
      await previous?.completion;
      try {
        signal.throwIfAborted();
        const result = await query(signal);
        if (mounted.current && !signal.aborted) update(result);
      } catch (caught) {
        if (mounted.current && !signal.aborted) showError(errorMessage(caught));
      } finally {
        if (pageRead.current?.controller === controller) {
          pageRead.current = null;
          if (mounted.current) stopLoading();
        }
      }
    })();
    pageRead.current = { controller, completion, stopLoading };
  }

  const loadApps = (id: string) =>
    loadPage((signal) => service.listApps(id, signal), updateAppInventory, setAppsError, setAppsLoading);

  const loadButtons = (id: string) => {
    setButtonChangeError(null);
    loadPage((signal) => service.listButtons(id, signal), setButtonMappings, setButtonsError, setButtonsLoading);
  };

  const buttonActions = service.buttonActions;
  const loadButtonApps = (id: string) => {
    if (buttonActions) {
      loadPage((signal) => buttonActions.listApps(id, signal), setButtonApps, setButtonAppsError, setButtonAppsLoading);
    }
  };

  const changeButton = (
    id: string,
    change: ButtonChange,
    reportError: (message: string) => void = setButtonChangeError,
  ) => {
    if (!buttonActions || selected?.id !== id) return Promise.resolve(false);
    return run(
      "Saving button assignment…",
      async () => {
        setButtonChangeError(null);
        const updated = await buttonActions.change(id, change);
        if (!mounted.current) return;
        const name = updated.app_name ?? buttonApps?.find((app) => app.id === updated.app_id)?.name ?? null;
        setButtonMappings((current) =>
          current?.status === "ready"
            ? {
                ...current,
                buttons: current.buttons.map((row) =>
                  row.button === change.button ? { ...updated, app_name: name } : row,
                ),
              }
            : current,
        );
      },
      "app",
      reportError,
    );
  };

  const updateButtonInventory = async (
    id: string,
    change: ButtonInventoryChange,
    reportError: (message: string) => void,
  ) => {
    if (!buttonActions || selected?.id !== id) return false;
    const success = await run(
      change.action === "learn" ? "Waiting for a remote button press…" : "Resetting remote buttons…",
      async () => {
        setButtonChangeError(null);
        await buttonActions.updateInventory(id, change);
      },
      "app",
      reportError,
    );
    if (success && mounted.current) loadButtons(id);
    return success;
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
    buttonMappings,
    buttonsLoading,
    buttonsError,
    buttonChangeError,
    buttonApps,
    buttonAppsLoading,
    buttonAppsError,
    backend,
    latestLauncher: launcherReleases?.[0]?.version ?? (launcherReleases === undefined ? undefined : null),
    launcherReleases,
    loading,
    busy,
    error,
    ready: !loading && backend !== null,
    connect,
    loadApps,
    loadButtons,
    loadButtonApps,
    changeButton,
    updateButtonInventory,
    cancelPageRead,
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
      cancelPageRead();
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
