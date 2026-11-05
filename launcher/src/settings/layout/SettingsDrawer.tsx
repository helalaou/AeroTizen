import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, House, X } from "lucide-preact";
import type { ComponentChildren } from "preact";

import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { Icon } from "../../shared/icons/Icon";
import { SettingsControl } from "../components/SettingsControl";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";

import type { Category } from "./categories";
import { categories } from "./categories";
import { SettingsFocusIndicator } from "./SettingsFocusIndicator";

// Categories and remote behaviour are shared by both appearance themes.
export const SettingsDrawer = ({ panes }: { panes: Record<Category, ComponentChildren> }) => {
  const {
    drawer,
    categoryMenu,
    categoryContent,
    categoryScroll,
    bridge,
    actions,
    updates,
    panes: paneRefs,
  } = useSettingsEnvironment();
  const state = useStore(drawer);
  const { unread } = useStore(updates);
  const { t } = useTranslation();
  const active = categories.find((category) => category.id === state.category);
  return (
    <div class="settings-drawer__frame">
      <aside class="settings-drawer__sidebar">
        <div class="settings-drawer__head">
          <div class="settings-drawer__kicker">
            {
              // eslint-disable-next-line launcher-i18n/translated-copy -- Product name.
              "AEROTIZEN"
            }
          </div>
          <h2>{t("common.settings")}</h2>
        </div>
        <div class="settings-drawer__menu" ref={categoryMenu}>
          <SettingsFocusIndicator container={categoryMenu} sidebar />
          {categories.map((category) => {
            const hasUpdate = category.id === "about" && unread;
            return (
              <SettingsControl
                key={category.id}
                class={"settings-category" + (state.category === category.id ? " is-current" : "")}
                focusKey={"section:" + category.id}
                role="button"
                aria-label={t(hasUpdate ? "settings.about.sectionNotice" : category.title)}
                aria-expanded={state.category === category.id && state.expanded}
                onClick={() => drawer.set({ category: category.id, expanded: true })}
              >
                <span class="settings-category__icon">
                  <Icon icon={category.icon} />
                </span>
                <span class="settings-category__label">
                  <strong>
                    {t(category.title)}
                    {hasUpdate && <span class="settings-update-dot" aria-hidden="true" />}
                  </strong>
                  <small>{t(hasUpdate ? "settings.about.updateAvailable" : category.hint)}</small>
                </span>
                <span class="settings-category__chevron">
                  <Icon icon={ChevronRight} />
                </span>
              </SettingsControl>
            );
          })}
          <div class="settings-drawer__return">
            <SettingsControl
              id="escape"
              class="settings-category"
              focusKey="escape"
              role="button"
              onClick={actions.useSamsungHome}
            >
              <span class="settings-category__icon">
                <Icon icon={House} />
              </span>
              <strong>{t("common.samsungHome")}</strong>
            </SettingsControl>
          </div>
        </div>
        <div class="settings-drawer__help">
          <span>
            <Icon icon={ChevronUp} />
            <Icon icon={ChevronDown} />
            {t("home.move")}
          </span>
          <span>{t("settings.drawer.select")}</span>
          <span>
            <Icon icon={ChevronLeft} />
            {t("settings.drawer.back")}
          </span>
        </div>
      </aside>
      <div class="settings-drawer__main" ref={categoryContent}>
        <div class="settings-drawer__content-head">
          <span class="settings-drawer__content-kicker">
            {t(state.category === "about" ? "settings.about.kicker" : "settings.drawer.customisation")}
          </span>
          <h2 class="settings-drawer__active-title">{active && t(active.title)}</h2>
          <SettingsControl
            class="settings-drawer__close"
            focusKey="settings-close"
            role="button"
            aria-label={t("settings.drawer.close")}
            onClick={bridge.close}
          >
            <Icon icon={X} />
          </SettingsControl>
        </div>
        <div class="settings-drawer__scroll" ref={categoryScroll}>
          <SettingsFocusIndicator container={categoryScroll} />
          {categories.map((category) => (
            <section
              key={category.id}
              class="settings-drawer__pane"
              data-section-pane={category.id}
              ref={(node) => {
                if (node) {
                  paneRefs.set(category.id, node);
                } else {
                  paneRefs.delete(category.id);
                }
              }}
              hidden={category.id !== state.category}
            >
              {panes[category.id]}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
