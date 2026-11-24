import { useEffect, useState } from "react";
import type { DesktopService, LauncherRelease } from "../contracts";
import type { FeatureContext } from "./context";
import { showToast } from "../Toasts";

export function useLauncher(service: DesktopService, context: FeatureContext) {
  const { selected, mounted, run, updateProfile } = context;
  const [launcherReleases, setLauncherReleases] = useState<LauncherRelease[] | null>();
  const [releaseCheck, setReleaseCheck] = useState(0);
  const [launcherReleasesLoading, setLauncherReleasesLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void service.launcherCatalog().then(
      (releases) => {
        if (!cancelled) {
          setLauncherReleases(releases);
          setLauncherReleasesLoading(false);
        }
      },
      () => {
        if (!cancelled) {
          setLauncherReleases(null);
          setLauncherReleasesLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [service, releaseCheck]);

  const installLauncher = (version: string, confirmReplace: boolean) => {
    if (!selected) return Promise.resolve(false);
    const { id } = selected;
    return run(`Installing AeroTizen ${version}…`, async () => {
      const updated = await service.installLauncher(id, version, selected.launcher_version, confirmReplace);
      if (updated.id !== id || updated.launcher_version !== version) {
        throw new Error("Could not verify the installed AeroTizen version. Refresh the TV to check.");
      }
      updateProfile(id, updated);
      if (mounted.current) showToast(`AeroTizen ${version} installed.`);
    });
  };

  const removeLauncher = (revision: string, reportError: (message: string) => void) => {
    if (!selected) return Promise.resolve(false);
    const { id, name } = selected;
    return run(
      "Removing AeroTizen…",
      async () => {
        const updated = await service.removeLauncher(id, revision, true);
        if (updated.id !== id || updated.launcher_version !== null) {
          throw new Error("Could not verify removal. Refresh the TV connection before trying again.");
        }
        updateProfile(id, updated);
        if (mounted.current) showToast(`AeroTizen removed from ${name}.`);
      },
      "app",
      reportError,
    );
  };

  return {
    latestLauncher: launcherReleases?.[0]?.version ?? (launcherReleases === undefined ? undefined : null),
    launcherReleases,
    launcherReleasesLoading,
    installLauncher,
    removeLauncher,
    retryLauncherVersions: () => {
      setLauncherReleasesLoading(true);
      setReleaseCheck((current) => current + 1);
    },
  };
}
