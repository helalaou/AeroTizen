import { useState } from "react";
import type { DesktopService, RootAccessStatus, RootSetupAction, RootUpdateAction } from "../contracts";
import { profileAfterRootSetup } from "../services/rootAccess";
import type { FeatureContext } from "./context";

export function useRootAccess(service: DesktopService, context: FeatureContext) {
  const { selected, mounted, run, loadPage, updateProfile } = context;
  const [rootStatus, setRootStatus] = useState<RootAccessStatus | null>(null);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const rootAccess = service.rootAccess;
  const loadRootStatus = (id: string) => {
    if (rootAccess) loadPage((signal) => rootAccess.status(id, signal), setRootStatus, setRootError, setRootLoading);
  };

  const changeRoot = async (
    label: string,
    change: () => Promise<RootAccessStatus>,
    reportError: (message: string) => void,
  ): Promise<RootAccessStatus | null> => {
    if (!rootAccess || !selected) return null;
    let result: RootAccessStatus | null = null;
    const success = await run(
      label,
      async () => {
        const status = await change();
        result = status;
        if (!mounted.current) return;
        setRootStatus(status);
        updateProfile(selected.id, (current) => profileAfterRootSetup(current, status));
      },
      "app",
      reportError,
    );
    return success ? result : null;
  };

  const setupRoot = (action: RootSetupAction, reportError: (message: string) => void) =>
    changeRoot(
      action === "start" ? "Setting up root access…" : "Checking root setup after restart…",
      () => rootAccess!.setup(selected!.id, action),
      reportError,
    );

  const previewRestart = rootAccess?.simulateRestart;
  const upgradeRoot = (action: RootUpdateAction, reportError: (message: string) => void) =>
    changeRoot(
      action === "start" ? "Updating the root helper…" : "Checking the root helper update…",
      () => rootAccess!.upgrade(selected!.id, action),
      reportError,
    );
  const simulateRootRestart = previewRestart
    ? async (reportError: (message: string) => void) => {
        if (!selected || !rootAccess) return;
        await run(
          "Simulating a TV restart…",
          async () => {
            await previewRestart(selected.id);
            const status = await rootAccess.status(selected.id, new AbortController().signal);
            if (mounted.current) setRootStatus(status);
          },
          "app",
          reportError,
        );
      }
    : undefined;

  return {
    rootStatus,
    rootLoading,
    rootError,
    loadRootStatus,
    setupRoot,
    upgradeRoot,
    simulateRootRestart,
    resetRootStatus: () => {
      setRootStatus(null);
      setRootError(null);
    },
  };
}
