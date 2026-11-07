import { House, X } from "lucide-preact";
import type { ComponentChildren } from "preact";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon/Icon";
import { SettingsControl } from "../../components/SettingsControl/SettingsControl";
import { SettingsHeading } from "../../components/SettingsHeading/SettingsHeading";
import { SettingsPanel } from "../../components/SettingsPanel/SettingsPanel";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";
import type { Category } from "../categories";
import { categories } from "../categories";
import { SettingsCategory } from "../SettingsCategory/SettingsCategory";
import { SettingsFocusIndicator } from "../SettingsFocusIndicator/SettingsFocusIndicator";
import { SettingsHelp } from "../SettingsHelp/SettingsHelp";

import styles from "./SettingsDrawer.module.css";

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
  const expanded = state.expanded ? "true" : "false";
  return (
    <SettingsPanel class={styles.frame} data-settings-drawer="frame" data-expanded={expanded}>
      <aside class={styles.sidebar} data-settings-drawer="sidebar" data-expanded={expanded}>
        <div class={styles.head}>
          <div class={styles.kicker} data-product-name>
            {
              // eslint-disable-next-line launcher-i18n/translated-copy -- Product name.
              "AEROTIZEN"
            }
          </div>
          <h2 class={styles.sidebarTitle}>{t("common.settings")}</h2>
        </div>
        <div class={styles.menu} data-settings-drawer="menu" ref={categoryMenu}>
          <SettingsFocusIndicator container={categoryMenu} sidebar />
          {categories.map((category) => {
            const hasUpdate = category.id === "about" && unread;
            const current = state.category === category.id;
            return (
              <SettingsCategory
                key={category.id}
                focusKey={"section:" + category.id}
                accessibleLabel={t(hasUpdate ? "settings.about.sectionNotice" : category.title)}
                expanded={current && state.expanded}
                current={current}
                icon={category.icon}
                label={t(category.title)}
                hint={t(hasUpdate ? "settings.about.updateAvailable" : category.hint)}
                notice={hasUpdate}
                onSelect={() => drawer.set({ category: category.id, expanded: true })}
              />
            );
          })}
          <div class={styles.return}>
            <SettingsCategory
              id="escape"
              focusKey="escape"
              variant="return"
              icon={House}
              label={t("common.samsungHome")}
              onSelect={actions.useSamsungHome}
            />
          </div>
        </div>
        <SettingsHelp />
      </aside>
      <div class={styles.main} data-settings-drawer="main" ref={categoryContent} hidden={!state.expanded}>
        <SettingsHeading
          class={styles.contentHead}
          kicker={t(state.category === "about" ? "settings.about.kicker" : "settings.drawer.customisation")}
          title={active ? t(active.title) : ""}
          data-settings-title
        >
          <SettingsControl
            class={styles.close}
            focusKey="settings-close"
            role="button"
            aria-label={t("settings.drawer.close")}
            onClick={bridge.close}
          >
            <Icon icon={X} />
          </SettingsControl>
        </SettingsHeading>
        <div class={styles.scroll} data-settings-drawer="scroll" ref={categoryScroll}>
          <SettingsFocusIndicator container={categoryScroll} />
          {categories.map((category) => (
            <section
              key={category.id}
              class={styles.pane}
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
    </SettingsPanel>
  );
};
