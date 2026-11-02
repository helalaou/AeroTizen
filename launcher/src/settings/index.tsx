import { createRef, render } from "preact";
import { flushSync } from "preact/compat";

import { CustomClock } from "../clock/CustomClock";
import type { SettingsStore } from "../contracts/preferences";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createNavigation } from "../shared/navigation/createNavigation";
import { focusControl } from "../shared/navigation/focusControl";
import { createStore } from "../shared/state/createStore";

import { createSettingsBridge } from "./services/createSettingsBridge";
import { createSettingsInventory } from "./services/createSettingsInventory";
import { createSettingsServices } from "./services/createSettingsServices";
import { SettingsProvider } from "./SettingsProvider";
import { SettingsRoot } from "./SettingsRoot";
import { createSettingsActions } from "./state/createSettingsActions";
import type { SettingsEnvironment, ViewState } from "./types";

export const mountSettings = (
  runtime: LauncherRuntime,
  platform: LauncherPlatform,
  settings: SettingsStore,
  mount: HTMLElement,
  clockMount: HTMLElement | null,
) => {
  const view = createStore<ViewState>({
    open: false,
    previewing: false,
    mounted: false,
    openedAt: 0,
    adjusting: false,
  });
  const inventory = createSettingsInventory(runtime);
  const services = createSettingsServices(runtime, platform);
  const actions = createSettingsActions(settings, services, view, flushSync);
  const bridge = createSettingsBridge(settings, view, services, flushSync);
  const root = createRef<HTMLDivElement>();
  const glass = createStore<import("./glass/categories").GlassState>({
    category: "appearance",
    expanded: false,
  });
  const glassMenu = createRef<HTMLDivElement>(),
    glassContent = createRef<HTMLDivElement>(),
    glassScroll = createRef<HTMLDivElement>();
  const navigation = createNavigation((element) => {
    // A command can restore browser focus without changing the selected key (IME Done).
    focusControl(element);
    if (glassScroll.current?.contains(element)) {
      const item = element.getBoundingClientRect(),
        clip = glassScroll.current.getBoundingClientRect();
      if (item.bottom > clip.bottom - 30) {
        glassScroll.current.scrollTop += item.bottom - clip.bottom + 30;
      } else if (item.top < clip.top + 10) {
        glassScroll.current.scrollTop += item.top - clip.top - 10;
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
    bridge,
    navigation,
    root,
    glass,
    glassMenu,
    glassContent,
    glassScroll,
  };
  const dispose = () => {
    if (clockMount) {
      render(null, clockMount);
    }
    render(null, mount);
    inventory.dispose();
  };
  try {
    render(
      <SettingsProvider environment={environment}>
        <SettingsRoot />
      </SettingsProvider>,
      mount,
    );
    if (clockMount) {
      render(<CustomClock settings={settings} clock={runtime.clock} />, clockMount);
    }
    return { bridge, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
};
