import { useLayoutEffect } from "preact/hooks";

import { useStore } from "../shared/hooks/useStore";

import { AppActionsMenu } from "./components/AppActionsMenu";
import { AppGrid } from "./components/AppGrid";
import { ContinueWatchingRow } from "./components/ContinueWatchingRow";
import { HomeHeader } from "./components/HomeHeader";
import { InputDock } from "./components/InputDock";
import type { HomeEnvironment } from "./types";

export const Home = ({ env }: { env: HomeEnvironment }) => {
  const settings = useStore(env.settings);
  const { page, active, draft, scroll } = useStore(env.state);
  const { apps, inputs, items, ready } = useStore(env.inventory);
  const home = draft || (settings.homeInitialized ? settings.home : [env.runtime.config.FIREPLACE_ID]);
  const visibleHome = home.filter(
    (id) => id === env.runtime.config.FIREPLACE_ID || !ready || apps.some((app) => app.id === id),
  );
  const size = settings.cardSize === "small" ? "small" : "big";
  useLayoutEffect(() => {
    env.bridge.focus();
  }, [env, page, apps, inputs, items, ready, settings.home, settings.homeInitialized, draft, size]);
  return (
    <>
      <HomeHeader env={env} />
      <div class={"content-viewport" + (scroll > 0 ? " is-scrolled" : "")} aria-hidden={!active}>
        <div class="content-mask">
          <main id="rows" ref={env.rows} style={{ transform: "translate3d(0," + -scroll + "px,0)" }}>
            <div class="home-page-surface" data-page={page}>
              <AppGrid
                env={env}
                ids={visibleHome}
                apps={apps}
                settings={settings}
                page="home"
                shown={page === "home"}
                active={active}
                label="Home apps"
              />
              <AppGrid
                env={env}
                ids={apps.map((app) => app.id)}
                apps={apps}
                settings={settings}
                page="apps"
                shown={page === "apps"}
                active={active}
                label="All apps"
              />
              <p id="apps-empty" class="apps-empty" hidden={page === "home" || apps.length > 0}>
                {env.translate("No apps found.")}
              </p>
              <ContinueWatchingRow env={env} items={items} visible={page === "home" && settings.continueWatching} />
              <InputDock env={env} inputs={inputs} visible={page === "home"} glass={settings.glassSettings} />
            </div>
          </main>
        </div>
      </div>
      <AppActionsMenu env={env} />
    </>
  );
};
