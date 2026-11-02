import { ChevronRight, X } from "lucide-preact";
import type { ComponentChildren } from "preact";

import { useStore } from "../../shared/hooks/useStore";
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
    services,
    panes: paneRefs,
  } = useSettingsEnvironment();
  const state = useStore(drawer);
  const text = services.translate;
  return (
    <div class="settings-drawer__frame">
      <aside class="settings-drawer__sidebar">
        <div class="settings-drawer__head">
          <div class="settings-drawer__kicker">AEROTIZEN</div>
          <h2>{text("Settings")}</h2>
        </div>
        <div class="settings-drawer__menu" ref={categoryMenu}>
          <SettingsFocusIndicator container={categoryMenu} sidebar />
          {categories.map((category) => (
            <SettingsControl
              key={category.id}
              class={"settings-category" + (state.category === category.id ? " is-current" : "")}
              focusKey={"section:" + category.id}
              role="button"
              aria-label={text(category.title)}
              aria-expanded={state.category === category.id && state.expanded}
              onClick={() => drawer.set({ category: category.id, expanded: true })}
            >
              <span class="settings-category__icon" aria-hidden="true">
                <Icon icon={category.icon} />
              </span>
              <span class="settings-category__label">
                <strong>{text(category.title)}</strong>
                <small>{text(category.hint)}</small>
              </span>
              <span class="settings-category__chevron" aria-hidden="true">
                <Icon icon={ChevronRight} />
              </span>
            </SettingsControl>
          ))}
        </div>
        <div class="settings-drawer__help">{text("↑↓ Section   → Open   ← Back")}</div>
      </aside>
      <div class="settings-drawer__main" ref={categoryContent}>
        <div class="settings-drawer__content-head">
          <span class="settings-drawer__content-kicker">{text("CUSTOMISATION")}</span>
          <h2 class="settings-drawer__active-title">
            {text(categories.find((category) => category.id === state.category)?.title || "")}
          </h2>
          <SettingsControl
            class="settings-drawer__close"
            focusKey="settings-close"
            role="button"
            aria-label={text("Close settings")}
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
