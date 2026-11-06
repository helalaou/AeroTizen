import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../contracts/launcher";
import type { HomeEnvironment } from "../types";

import { AppArtwork } from "./AppArtwork/AppArtwork";
import { HomeAppCard } from "./HomeAppCard/HomeAppCard";

export const AppCard = ({ env, app, active }: { env: HomeEnvironment; app: InstalledApp; active: boolean }) => {
  const brand = useMemo(() => env.describe(app), [env, app]);
  return (
    <HomeAppCard env={env} id={app.id} registered={active} title={brand.title} background={brand.background}>
      <AppArtwork app={app} brand={brand} active={active} />
    </HomeAppCard>
  );
};
