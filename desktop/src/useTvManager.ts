import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./contracts";
import type { BackendStatus, DesktopService, SavedTv, TvCandidate } from "./contracts";
import type { FeatureContext, PendingOperation, ProfileUpdate } from "./features/context";
import { useLauncher } from "./features/useLauncher";
import { useApps } from "./features/useApps";
import { useButtons } from "./features/useButtons";
import { useRootAccess } from "./features/useRootAccess";
import { applyNativeHome, restoreHomeBackup } from "./features/homeActions";

export function useTvManager(service: DesktopService) {
  const [profiles, setProfiles] = useState<SavedTv[]>([]);
  const [candidates, setCandidates] = useState<TvCandidate[] | null>(null);
  const [selected, setSelected] = useState<SavedTv | null>(null);
  const [backend, setBackend] = useState<BackendStatus | null>(null);
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

  const loadPage = useCallback(function loadPage<Result>(
    query: (signal: AbortSignal) => Promise<Result>,
    update: (result: Result | null) => void,
    showError: (error: string | null) => void,
    setLoading: (loading: boolean) => void,
    options?: { preserveResult?: boolean },
  ) {
    const previous = pageRead.current;
    if (active.current || (previous && !previous.controller.signal.aborted)) return;
    const controller = new AbortController();
    const { signal } = controller;
    if (!options?.preserveResult) update(null);
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
  }, []);

  const updateProfile = (id: string, profile: ProfileUpdate) => {
    if (!mounted.current) return;
    const update = (current: SavedTv) => (typeof profile === "function" ? profile(current) : profile);
    setProfiles((current) => current.map((item) => (item.id === id ? update(item) : item)));
    setSelected((current) => (current?.id === id ? update(current) : current));
  };

  const context: FeatureContext = { selected, mounted, run, loadPage, cancelPageRead, updateProfile };
  const launcher = useLauncher(service, context);
  const { resetApps, ...apps } = useApps(service, context);
  const buttons = useButtons(service, context);
  const { resetRootStatus, ...root } = useRootAccess(service, context);
  const home = {
    applyNativeHome: service.applyNativeHome
      ? (id: string, reportError: (message: string) => void) =>
          applyNativeHome(service, { selected, run, updateProfile }, id, reportError)
      : undefined,
    restoreHomeBackup: service.restoreHomeBackup
      ? (id: string, capturedAt: string, reportError: (message: string) => void) =>
          restoreHomeBackup(service, { selected, run, updateProfile }, id, capturedAt, reportError)
      : undefined,
  };
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
        resetRootStatus();
        resetApps();
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

  const prepareCertificates = (id: string, reportError: (message: string) => void) =>
    run(
      "Creating signing certificates…",
      async () => {
        if (!service.samsung || selected?.id !== id) throw new Error("Connect to this TV before setting it up.");
        const result = await service.samsung.prepareCertificates(id);
        if (result.identity_sha256 !== id || !result.launcher_signing_ready) {
          throw new Error("Could not verify the signing certificates for this TV.");
        }
        updateProfile(id, { ...selected, launcher_signing_ready: true });
      },
      "app",
      reportError,
    );

  return {
    profiles,
    candidates,
    selected,
    backend,
    loading,
    busy,
    error,
    ready: !loading && backend !== null,
    ...launcher,
    ...apps,
    ...buttons,
    ...root,
    ...home,
    connect,
    discover,
    rename,
    forget,
    prepareCertificates,
    cancelPageRead,
    clearError: () => setError(null),
    back: () => {
      cancelPageRead();
      setError(null);
      setSelected(null);
      resetApps();
    },
  };
}

export type TvManager = ReturnType<typeof useTvManager>;
