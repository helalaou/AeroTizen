import { memo } from "preact/compat";
import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../contracts/launcher";
import type { HomeEnvironment } from "../types";

import { AppArtwork } from "./AppArtwork/AppArtwork";
import { HomeAppCard } from "./HomeAppCard/HomeAppCard";

export const AppCard = memo(({ env, app, active }: { env: HomeEnvironment; app: InstalledApp; active: boolean }) => {
  const presentation = useMemo(() => env.describe(app), [env, app]);
  return (
    <HomeAppCard env={env} id={app.id} registered={active} title={presentation.title}>
      <AppArtwork presentation={presentation} active={active} />
    </HomeAppCard>
  );
});
