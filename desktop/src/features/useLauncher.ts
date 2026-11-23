import { useEffect, useState } from "react";
import type { DesktopService, LauncherRelease } from "../contracts";
import type { FeatureContext } from "./context";

export function useLauncher(service: DesktopService, context: FeatureContext) {
  const { selected, run, updateProfile } = context;
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
      updateProfile(id, updated);
    });
  };

  return {
    latestLauncher: launcherReleases?.[0]?.version ?? (launcherReleases === undefined ? undefined : null),
    launcherReleases,
    launcherReleasesLoading,
    installLauncher,
    retryLauncherVersions: () => {
      setLauncherReleasesLoading(true);
      setReleaseCheck((current) => current + 1);
    },
  };
}
