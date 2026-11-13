import { memo } from "preact/compat";
import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../contracts/launcher";
import type { HomeEnvironment } from "../types";

import { HomeAppCard } from "./HomeAppCard/HomeAppCard";

export const AppCard = memo(
  ({ env, app, active, onHome }: { env: HomeEnvironment; app: InstalledApp; active: boolean; onHome?: boolean }) => {
    const presentation = useMemo(() => env.describe(app), [env, app]);
    return (
      <HomeAppCard
        env={env}
        id={app.id}
        registered={active}
        title={presentation.title}
        presentation={presentation}
        selected={onHome}
      />
    );
  },
);
