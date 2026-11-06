import { ArrowUp } from "lucide-preact";
import { useLayoutEffect } from "preact/hooks";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon";
import type { HomeEnvironment } from "../../types";
import { AppActionsMenu } from "../AppActionsMenu/AppActionsMenu";
import { AppGrid } from "../AppGrid/AppGrid";
import { ContinueWatchingRow } from "../ContinueWatchingRow/ContinueWatchingRow";
import { HomeControl } from "../HomeControl/HomeControl";
import { HomeHeader } from "../HomeHeader";
import { InputDock } from "../InputDock";

import styles from "./Home.module.css";

export const Home = ({ env }: { env: HomeEnvironment }) => {
  const { t } = useTranslation();
  const settings = useStore(env.settings);
  const { page, active, appsEndOffset, draft, scroll } = useStore(env.state);
  const { apps, inputs, items, ready } = useStore(env.inventory);
  const home = draft || (settings.homeInitialized ? settings.home : [env.runtime.config.FIREPLACE_ID]);
  const visibleHome = home.filter(
    (id) => id === env.runtime.config.FIREPLACE_ID || !ready || apps.some((app) => app.id === id),
  );
  const showContinueWatching = page === "home" && settings.continueWatching && items.length > 0;
  const dockInputs =
    page === "home" &&
    inputs.length > 0 &&
    !showContinueWatching &&
    visibleHome.length > 0 &&
    (settings.homeAppLayout === "scroll" || visibleHome.length <= env.columns(settings));
  const atAppsEnd = page === "apps" && scroll === appsEndOffset;
  useLayoutEffect(() => {
    env.bridge.focus();
  }, [
    env,
    page,
    apps,
    inputs,
    items,
    ready,
    settings.home,
    settings.homeInitialized,
    draft,
    settings.homeCardColumns,
    settings.homeAppLayout,
    settings.clockLayout,
    settings.aeroClockStyle,
  ]);
  return (
    <div class={styles.home} data-home data-expanded={settings.clockLayout === "custom" ? "true" : "false"}>
      <HomeHeader env={env} />
      <div
        class={styles.viewport}
        data-home-viewport
        data-scrolled={scroll > 0 ? "true" : "false"}
        data-at-apps-end={atAppsEnd ? "true" : "false"}
        aria-hidden={!active}
      >
        <div class={styles.mask} data-home-mask data-scrolled={scroll > 0 && !atAppsEnd ? "true" : "false"}>
          <main
            id="rows"
            class={styles.rows}
            data-home-content
            data-page={page}
            data-docked={dockInputs ? "true" : "false"}
            ref={env.rows}
            style={{ "--home-offset": -scroll + "px", "--apps-end-offset": appsEndOffset + "px" }}
          >
            <div class={styles.page} data-home-page data-page={page} data-docked={dockInputs ? "true" : "false"}>
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
              <p id="apps-empty" class={styles.empty} hidden={page === "home" || apps.length > 0}>
                {t("home.emptyApps")}
              </p>
              <ContinueWatchingRow env={env} items={items} visible={showContinueWatching} />
              <InputDock env={env} inputs={inputs} visible={page === "home"} glass={settings.glassSettings} />
            </div>
            {page === "apps" && apps.length > 0 && (
              <HomeControl
                env={env}
                controlKey="back-to-top"
                className={styles.backToTop}
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
    </div>
  );
};
