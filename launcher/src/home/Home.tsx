import { ArrowUp } from "lucide-preact";
import { useLayoutEffect } from "preact/hooks";

import { useStore } from "../shared/hooks/useStore";
import { useTranslation } from "../shared/i18n/useTranslation";
import { Icon } from "../shared/icons/Icon";

import { AppActionsMenu } from "./components/AppActionsMenu";
import { AppGrid } from "./components/AppGrid";
import { ContinueWatchingRow } from "./components/ContinueWatchingRow";
import { HomeControl } from "./components/HomeControl";
import { HomeHeader } from "./components/HomeHeader";
import { InputDock } from "./components/InputDock";
import type { HomeEnvironment } from "./types";

export const Home = ({ env }: { env: HomeEnvironment }) => {
  const { t } = useTranslation();
  const settings = useStore(env.settings);
  const { page, active, appsEndOffset, draft, scroll } = useStore(env.state);
  const { apps, inputs, items, ready } = useStore(env.inventory);
  const home = draft || (settings.homeInitialized ? settings.home : [env.runtime.config.FIREPLACE_ID]);
  const visibleHome = home.filter(
    (id) => id === env.runtime.config.FIREPLACE_ID || !ready || apps.some((app) => app.id === id),
  );
  const size = settings.cardSize === "small" ? "small" : "big";
  const showContinueWatching = page === "home" && settings.continueWatching && items.length > 0;
  const dockInputs =
    page === "home" &&
    inputs.length > 0 &&
    !showContinueWatching &&
    visibleHome.length > 0 &&
    visibleHome.length <= env.columns(settings);
  const viewportClass = "content-viewport" + (scroll > 0 ? " is-scrolled" : "");
  const atAppsEnd = page === "apps" && scroll === appsEndOffset;
  const dockClass = dockInputs ? "rows--dock-inputs" : undefined;
  useLayoutEffect(() => {
    env.bridge.focus();
  }, [env, page, apps, inputs, items, ready, settings.home, settings.homeInitialized, draft, size]);
  return (
    <>
      <HomeHeader env={env} />
      <div class={viewportClass + (atAppsEnd ? " is-at-apps-end" : "")} aria-hidden={!active}>
        <div class="content-mask">
          <main
            id="rows"
            class={page === "apps" ? "rows--apps" : dockClass}
            ref={env.rows}
            style={{ "--home-offset": -scroll + "px", "--apps-end-offset": appsEndOffset + "px" }}
          >
            <div class="home-page-surface" data-page={page}>
              <AppGrid
                env={env}
                ids={visibleHome}
                apps={apps}
                settings={settings}
                page="home"
                shown={page === "home"}
                active={active}
                label={t("home.homeApps")}
              />
              <AppGrid
                env={env}
                ids={apps.map((app) => app.id)}
                apps={apps}
                settings={settings}
                page="apps"
                shown={page === "apps"}
                active={active}
                label={t("home.allApps")}
              />
              <p id="apps-empty" class="apps-empty" hidden={page === "home" || apps.length > 0}>
                {t("home.emptyApps")}
              </p>
              <ContinueWatchingRow env={env} items={items} visible={showContinueWatching} />
              <InputDock env={env} inputs={inputs} visible={page === "home"} glass={settings.glassSettings} />
            </div>
            {page === "apps" && apps.length > 0 && (
              <HomeControl
                env={env}
                controlKey="back-to-top"
                className="back-to-top"
                title={t("home.backToTop")}
                preserveSelection
              >
                <Icon icon={ArrowUp} />
              </HomeControl>
            )}
          </main>
        </div>
      </div>
      <AppActionsMenu env={env} />
    </>
  );
};
