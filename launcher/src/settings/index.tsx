import { createRef, render } from "preact";
import { flushSync } from "preact/compat";

import type { SettingsStore } from "../contracts/preferences";
import type { LauncherUpdateNotice } from "../contracts/updates";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import type { Translations } from "../shared/i18n/createTranslations";
import { TranslationContext } from "../shared/i18n/useTranslation";
import { createNavigation } from "../shared/navigation/createNavigation";
import { focusControl } from "../shared/navigation/focusControl";
import { createStore } from "../shared/state/createStore";

import { createSettingsBridge } from "./services/createSettingsBridge";
import { createSettingsInventory } from "./services/createSettingsInventory";
import { createSettingsServices } from "./services/createSettingsServices";
import { SettingsProvider } from "./SettingsProvider";
import { SettingsRoot } from "./SettingsRoot/SettingsRoot";
import { createSettingsActions } from "./state/createSettingsActions";
import type { SettingsEnvironment, ViewState } from "./types";

export const mountSettings = (
  runtime: LauncherRuntime,
  platform: LauncherPlatform,
  settings: SettingsStore,
  mount: HTMLElement,
  translations: Translations,
  updates: LauncherUpdateNotice,
) => {
  const view = createStore<ViewState>({
    open: false,
    previewing: false,
    mounted: false,
    openedAt: 0,
    adjusting: false,
    colourPicker: null,
  });
  const inventory = createSettingsInventory(runtime);
  const services = createSettingsServices(runtime, platform);
  const actions = createSettingsActions(settings, services, view, flushSync);
  const bridge = createSettingsBridge(view, services, flushSync);
  const root = createRef<HTMLDivElement>();
  const drawer = createStore<import("./layout/categories").SettingsDrawerState>({
    category: "appearance",
    expanded: false,
  });
  const categoryMenu = createRef<HTMLDivElement>();
  const categoryContent = createRef<HTMLDivElement>();
  const categoryScroll = createRef<HTMLDivElement>();
  const navigation = createNavigation((element) => {
    // A command can restore browser focus without changing the selected key (IME Done).
    focusControl(element);
    let scroll = categoryScroll.current;
    if (!scroll?.contains(element)) {
      scroll = categoryMenu.current;
    }
    if (scroll?.contains(element)) {
      const item = element.getBoundingClientRect();
      const clip = scroll.getBoundingClientRect();
      if (item.bottom > clip.bottom - 30) {
        scroll.scrollTop += item.bottom - clip.bottom + 30;
      } else if (item.top < clip.top + 10) {
        scroll.scrollTop += item.top - clip.top - 10;
      }
    } else if (root.current) {
      root.current.scrollTop = Math.max(0, element.offsetTop - 640);
    }
  });
  const environment: SettingsEnvironment = {
    settings,
    inventory,
    view,
    services,
    actions,
    updates,
    bridge,
    navigation,
    root,
    drawer,
    categoryMenu,
    categoryContent,
    categoryScroll,
    panes: new Map(),
  };
  const dispose = () => {
    render(null, mount);
    inventory.dispose();
  };
  try {
    render(
      <TranslationContext.Provider value={translations}>
        <SettingsProvider environment={environment}>
          <SettingsRoot />
        </SettingsProvider>
      </TranslationContext.Provider>,
      mount,
    );
    return { bridge, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
};
