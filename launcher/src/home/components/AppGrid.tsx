import type { InstalledApp } from "../../contracts/launcher";
import type { SettingsSnapshot } from "../../contracts/preferences";
import type { HomeEnvironment, Page } from "../types";

import { AppCard } from "./AppCard";
import { FireplaceCard } from "./FireplaceCard";

export const AppGrid = ({
  env,
  ids,
  apps,
  settings,
  page,
  shown,
  active,
  label,
}: {
  env: HomeEnvironment;
  ids: readonly string[];
  apps: readonly InstalledApp[];
  settings: SettingsSnapshot;
  page: Page;
  shown: boolean;
  active: boolean;
  label: string;
}) => {
  const size = settings.cardSize === "small" ? "small" : "big";
  return (
    <div
      style={{ display: shown ? undefined : "none" }}
      hidden={!shown}
      id={shown ? "grid" : page + "-grid-parked"}
      class={"app-grid cards-" + size + " cards-" + settings.homeCardMode + " cols-" + env.columns(settings)}
      aria-label={label}
    >
      {ids.map((id) => {
        if (id === env.runtime.config.FIREPLACE_ID) {
          return <FireplaceCard key={id} env={env} registered={shown} />;
        }
        const app = apps.find((app) => app.id === id) || { id, name: id, icon: "" };
        return <AppCard key={id} env={env} app={app} active={active && shown} />;
      })}
    </div>
  );
};
