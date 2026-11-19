import { ArrowUp } from "lucide-preact";
import { useLayoutEffect } from "preact/hooks";

import { getHomeLayout, usesHomeAppRail } from "../../../shared/homeLayout";
import { useStore, useStoreSelector } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon/Icon";
import { getHomeLayoutView } from "../../layouts/homeLayoutViews";
import type { HomeEnvironment } from "../../types";
import { AppActionsMenu } from "../AppActionsMenu/AppActionsMenu";
import { AppGrid } from "../AppGrid/AppGrid";
import { ContinueWatchingRow } from "../ContinueWatchingRow/ContinueWatchingRow";
import { HomeControl } from "../HomeControl/HomeControl";
import { HomeHeader } from "../HomeHeader/HomeHeader";
import { InputDock } from "../InputDock/InputDock";

import styles from "./Home.module.css";

interface Props {
  env: HomeEnvironment;
  onBackdropVisibilityChange(visible: boolean): void;
}

export const Home = ({ env, onBackdropVisibilityChange }: Props) => {
  const { t } = useTranslation();
  const settings = useStore(env.settings);
  const page = useStoreSelector(env.state, (state) => state.page);
  const active = useStoreSelector(env.state, (state) => state.active);
  const appsEndOffset = useStoreSelector(env.state, (state) => state.appsEndOffset);
  const draft = useStoreSelector(env.state, (state) => state.draft);
  const scroll = useStoreSelector(env.state, (state) => state.scroll);
  const { apps, inputs, items, ready } = useStore(env.inventory);
  const definition = getHomeLayout(settings.homeLayout);
  const { ProgrammeFeature, Sections, rootClass, showProgrammeDetails } = getHomeLayoutView(settings.homeLayout);
  const onHome = page === "home";
  const scrollMode = onHome ? definition.scroll : "offset";
  const home = draft || (settings.homeInitialized ? settings.home : [env.runtime.config.FIREPLACE_ID]);
  const visibleHome = home.filter(
    (id) => id === env.runtime.config.FIREPLACE_ID || !ready || apps.some((app) => app.id === id),
  );
  const showContinueWatching = onHome && settings.continueWatching && items.length > 0;
  const dockInputs =
    onHome &&
    definition.dockInputsWhenSpaceAllows &&
    inputs.length > 0 &&
    !showContinueWatching &&
    visibleHome.length > 0 &&
    (usesHomeAppRail(settings) || visibleHome.length <= settings.homeCardColumns);
  const atAppsEnd = page === "apps" && scroll === appsEndOffset;
  useLayoutEffect(() => {
    const viewport = env.viewport.current;
    if (scrollMode === "offset" && viewport?.scrollTop) {
      viewport.scrollTop = 0;
    }
    env.bridge.focus();
  }, [
    env,
    page,
    scrollMode,
    apps,
    inputs,
    items,
    ready,
    settings.home,
    settings.homeInitialized,
    draft,
    settings.homeCardColumns,
    settings.homeAppLayout,
    settings.homeLayout,
    settings.continueWatching,
    settings.clockLayout,
    settings.aeroClockStyle,
  ]);
  const homeSections = {
    apps: {
      visible: onHome && visibleHome.length > 0,
      content: (
        <AppGrid
          key="apps"
          env={env}
          ids={visibleHome}
          apps={apps}
          settings={settings}
          page="home"
          shown={onHome}
          active={active}
          label={t("home.homeApps")}
        />
      ),
    },
    continueWatching: {
      visible: showContinueWatching,
      content: (
        <ContinueWatchingRow
          key="continueWatching"
          env={env}
          items={items}
          showDetails={showProgrammeDetails}
          showHeading={settings.showContinueWatchingHeading}
          visible={showContinueWatching}
        />
      ),
    },
    inputs: {
      visible: onHome && inputs.length > 0,
      content: (
        <InputDock key="inputs" env={env} inputs={inputs} visible={onHome} showHeading={settings.showInputsHeading} />
      ),
    },
  };
  return (
    <div
      class={onHome && rootClass ? styles.home + " " + rootClass : styles.home}
      data-home
      data-layout={settings.homeLayout}
      data-scroll-mode={scrollMode}
      data-expanded={settings.clockLayout === "custom" ? "true" : "false"}
    >
      {ProgrammeFeature && showContinueWatching && (
        <ProgrammeFeature env={env} items={items} onBackdropVisibilityChange={onBackdropVisibilityChange} />
      )}
      <HomeHeader env={env} />
      <div
        class={styles.viewport}
        data-home-viewport
        ref={env.viewport}
        data-scrolled={scroll > 0 ? "true" : "false"}
        data-at-apps-end={atAppsEnd ? "true" : "false"}
        aria-hidden={!active}
      >
        <div class={styles.mask} data-home-mask data-scrolled={scroll > 0 && !atAppsEnd ? "true" : "false"}>
          <div
            class={styles.maskContent}
            data-home-mask-content
            data-scrolled={scroll > 0 && !atAppsEnd ? "true" : "false"}
          >
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
                <Sections definition={definition} sections={homeSections} />
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
      </div>
      <AppActionsMenu env={env} />
    </div>
  );
};
