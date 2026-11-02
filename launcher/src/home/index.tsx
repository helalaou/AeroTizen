import { createRef, render } from "preact";
import { flushSync } from "preact/compat";

import type { SettingsStore } from "../contracts/preferences";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";

import { Home } from "./Home";
import { createHomeController } from "./state/createHomeController";
import { createHomeInventory } from "./state/createHomeInventory";

export const mountHome = (runtime: LauncherRuntime, settings: SettingsStore, mount: HTMLElement) => {
  const document = mount.ownerDocument;
  // Apply shell mode before any Home focus geometry is measured.
  const syncShell = () => document.body.classList.toggle("glass-ui", settings.getSnapshot().glassSettings);
  syncShell();
  const unsubscribeShell = settings.subscribe(syncShell);
  const inventory = createHomeInventory(runtime, settings, flushSync);
  const rows = createRef<HTMLElement>();
  const environment = createHomeController(
    {
      runtime,
      settings,
      inventory,
      rows,
      nodes: new Map(),
      translate: (value) => runtime.i18n?.t(value) || value,
      describe: (app) => runtime.tiles.describe(app),
      columns: (values) =>
        [3, 4, 5].includes(Number(values.homeCardColumns))
          ? Number(values.homeCardColumns)
          : runtime.config.CARD_COLUMNS[values.cardSize === "small" ? "small" : "big"],
    },
    flushSync,
  );
  const refresh = () => {
    inventory.refresh();
    environment.bridge.focus();
  };
  const bridge = { ...environment.bridge, render: refresh, buildRows: refresh, refreshApps: refresh };
  const dispose = () => {
    environment.bridge.blur();
    render(null, mount);
    inventory.dispose();
    unsubscribeShell();
    document.body.classList.remove("glass-ui");
  };
  try {
    render(<Home env={environment} />, mount);
    return { bridge, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
};
