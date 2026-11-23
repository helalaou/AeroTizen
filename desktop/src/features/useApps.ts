import { useState } from "react";
import type { DesktopService, TvAppPackage, NamedAppRemovalOutcome, LocalAppPackage } from "../contracts";
import type { FeatureContext } from "./context";

export function useApps(service: DesktopService, context: FeatureContext) {
  const { selected, mounted, run, loadPage, updateProfile } = context;
  const [apps, setApps] = useState<TvAppPackage[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appRemoval, setAppRemoval] = useState<NamedAppRemovalOutcome[]>([]);
  const [appRefusals, setAppRefusals] = useState<ReadonlyMap<string, string>>(() => new Map());
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

  const loadApps = (id: string) =>
    loadPage((signal) => service.listApps(id, signal), updateAppInventory, setAppsError, setAppsLoading);

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

  const chooseLocalApp = async (reportError: (message: string) => void) => {
    let chosen: LocalAppPackage | null = null;
    await run(
      "Reading local app…",
      async () => {
        if (!selected || !service.localApps) throw new Error("Connect to a TV before choosing an app.");
        chosen = await service.localApps.choose(selected.id);
      },
      "app",
      reportError,
    );
    return chosen;
  };

  const installLocalApp = async (app: LocalAppPackage, reportError: (message: string) => void) => {
    if (!selected || !service.localApps) return false;
    const { id } = selected;
    const localApps = service.localApps;
    const success = await run(
      `Installing ${app.name}…`,
      async () => {
        const result = await localApps.install(id, app.selection_id, true);
        if (result.profile.id !== id || result.app_id !== app.app_id || result.version !== app.version) {
          throw new Error("Could not verify the selected app on this TV. Refresh Apps to check.");
        }
        updateProfile(id, result.profile);
        if (mounted.current) {
          setAppRemoval([]);
          setApps(null);
        }
      },
      "app",
      reportError,
    );
    if (success && mounted.current) loadApps(id);
    return success;
  };

  return {
    apps,
    appsLoading,
    appsError,
    appRemoval,
    appRefusals,
    loadApps,
    removeApps,
    chooseLocalApp,
    installLocalApp,
    clearAppRemoval: () => setAppRemoval([]),
    resetApps: () => {
      setApps(null);
      setAppsError(null);
      setAppRemoval([]);
      setAppRefusals(new Map());
    },
  };
}
