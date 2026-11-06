import type { InstalledApp } from "../../contracts/launcher";
import type { SettingsSnapshot } from "../../contracts/preferences";
import { useStore } from "../../shared/hooks/useStore";
import type { HomeEnvironment, Page } from "../types";

import { AppCard } from "./AppCard";
import { FireplaceCard } from "./FireplaceCard";
import { HorizontalScroller } from "./HorizontalScroller";

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
  const { appOffset } = useStore(env.state);
  const scroll = page === "home" && settings.homeAppLayout === "scroll";
  return (
    <HorizontalScroller
      id={shown ? "grid" : page + "-grid-parked"}
      label={label}
      enabled={scroll}
      visible={shown}
      viewportClass="app-grid-viewport"
      trackClass={"app-grid cards-square cols-" + env.columns(settings) + (scroll ? " app-grid--scroll" : "")}
      trackRef={page === "home" ? env.appItems : undefined}
      viewportRef={page === "home" ? env.appViewport : undefined}
      offset={appOffset}
      onOffsetChange={(offset) => env.state.set({ ...env.state.getSnapshot(), appOffset: offset })}
    >
      {ids.map((id) => {
        if (id === env.runtime.config.FIREPLACE_ID) {
          return <FireplaceCard key={id} env={env} registered={shown} />;
        }
        const app = apps.find((app) => app.id === id) || { id, name: id, icon: "" };
        return <AppCard key={id} env={env} app={app} active={active && shown} />;
      })}
    </HorizontalScroller>
  );
};
