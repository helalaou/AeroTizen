import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../contracts/launcher";
import { useStore } from "../../shared/hooks/useStore";
import type { HomeEnvironment } from "../types";

import { AppArtwork } from "./AppArtwork";
import { HomeControl } from "./HomeControl";
import { ReorderControls } from "./ReorderControls";
export const AppCard = ({ env, app, active }: { env: HomeEnvironment; app: InstalledApp; active: boolean }) => {
  const brand = useMemo(() => env.describe(app), [env, app]);
  const state = useStore(env.state);
  const moving = state.moving === app.id;
  return (
    <HomeControl
      env={env}
      controlKey={"app:" + app.id}
      dataId={app.id}
      registered={active}
      className={"tile app-tile" + (moving ? " moving" : "")}
      title={brand.title}
      style={{ "--app-background": brand.background }}
    >
      <AppArtwork app={app} brand={brand} active={active} />
      {moving ? <ReorderControls env={env} id={app.id} /> : null}
    </HomeControl>
  );
};
