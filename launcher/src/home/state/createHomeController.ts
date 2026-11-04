import { focusControl } from "../../shared/navigation/focusControl";
import { createStore } from "../../shared/state/createStore";
import type { HomeEnvironment, HomeMenuChoice, HomeState, Page } from "../types";

const HEADER_KEYS = ["gear", "samsung-home-shortcut", "home-tab", "apps-tab"] as const;
const TOP_SCROLL_CLEARANCE = 128;
const APPS_END_CLEARANCE = 16;
const HOME_MENU_CHOICES = [
  { action: "move", label: "home.move" },
  { action: "remove", label: "home.removeFromHome" },
] as const;
const APP_MENU_CHOICES = {
  add: { action: "add", label: "home.addToHome" },
  remove: { action: "remove", label: "home.removeFromHome" },
} as const;

type Rows = readonly (readonly string[])[];

const getSelectedKey = (rows: Rows, selected: string, started: boolean) => {
  const first = rows[1]?.[0];
  if (!started && first) {
    return first;
  }
  if (rows.some((row) => row.includes(selected))) {
    return selected;
  }
  return first || "home-tab";
};

const getScrollOffset = ({
  selected,
  rows,
  previous,
  top,
  bottom,
  origin,
}: {
  selected: string;
  rows: Rows;
  previous: number;
  top: number;
  bottom: number;
  origin: number;
}) => {
  if (rows[0].includes(selected) || rows[1]?.includes(selected)) {
    return 0;
  }
  if (bottom - previous > 1000) {
    return bottom - 1000;
  }
  if (top - previous < origin + TOP_SCROLL_CLEARANCE) {
    return Math.max(0, top - origin - TOP_SCROLL_CLEARANCE);
  }
  return previous;
};

const moveItem = (items: readonly string[], from: number, to: number, item: string) => {
  const remaining = items.filter((_, index) => index !== from);
  return [...remaining.slice(0, to), item, ...remaining.slice(to)];
};

const getVerticalColumn = ({
  rows,
  row,
  target,
  selected,
  page,
  nodes,
  viewport,
}: {
  rows: Rows;
  row: number;
  target: number;
  selected: string;
  page: Page;
  nodes: ReadonlyMap<string, HTMLElement>;
  viewport: HTMLElement | null;
}) => {
  if (target === 0) {
    return rows[0].indexOf(page === "home" ? "home-tab" : "apps-tab");
  }
  const column = row === 0 ? 0 : rows[row].indexOf(selected);
  if (!selected.startsWith("continue:") && !rows[target][0]?.startsWith("continue:")) {
    return column;
  }
  const from = nodes.get(selected)?.getBoundingClientRect();
  if (!from) {
    return column;
  }
  const bounds = viewport?.getBoundingClientRect();
  const nearest = rows[target].reduce(
    (nearest, key, column) => {
      const rect = nodes.get(key)?.getBoundingClientRect();
      if (
        !rect ||
        (key.startsWith("continue:") && bounds && (rect.right <= bounds.left || rect.left >= bounds.right))
      ) {
        return nearest;
      }
      const distance = Math.abs(rect.left + rect.right - from.left - from.right);
      return distance < nearest.distance ? { column, distance } : nearest;
    },
    { column, distance: Infinity },
  );
  return nearest.column;
};

// Remote transactions publish state synchronously; Preact owns every rendered node.
// No app/service commands are reimplemented here.
export const createHomeController = (
  env: Omit<
    HomeEnvironment,
    "bridge" | "state" | "select" | "activate" | "showPage" | "choose" | "dismiss" | "menuChoices"
  >,
  transaction: (action: () => void) => void,
) => {
  const { runtime, settings, inventory, nodes } = env;
  const state = createStore<HomeState>({
    page: "home",
    appsEndOffset: 0,
    scroll: 0,
    continueOffset: 0,
    selected: "",
    active: true,
    moving: null,
    draft: null,
    menu: null,
  });
  let timer: number | undefined;
  let enterDown = false;
  let started = false;
  const cancelPress = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    timer = undefined;
    enterDown = false;
  };
  const update = (patch: Partial<HomeState>) =>
    transaction(() => {
      const before = state.getSnapshot();
      if (Object.keys(patch).some((key) => before[key as keyof HomeState] !== patch[key as keyof HomeState])) {
        state.set({ ...before, ...patch });
      }
    });
  const homeIds = () => {
    const saved =
      state.getSnapshot().draft ||
      (settings.getSnapshot().homeInitialized ? settings.getSnapshot().home : [runtime.config.FIREPLACE_ID]);
    // Movement must address the same visible IDs as the grid, not stale saved apps.
    return saved.filter(
      (id) => id === runtime.config.FIREPLACE_ID || !inventory.getSnapshot().ready || runtime.apps.byId(id),
    );
  };
  const ids = () =>
    state.getSnapshot().page === "home" ? homeIds() : inventory.getSnapshot().apps.map((app) => app.id);
  const sourceKey = (source: { type: string; number?: number }) => "input:" + source.type + ":" + source.number;
  const rows = (): readonly (readonly string[])[] => {
    const columns = env.columns(settings.getSnapshot());
    const all = ids();
    const appRows = Array.from({ length: Math.ceil(all.length / columns) }, (_, index) =>
      all.slice(index * columns, (index + 1) * columns).map((id) => "app:" + id),
    );
    const appLayout = [HEADER_KEYS, ...appRows];
    if (state.getSnapshot().page !== "home") {
      return all.length ? [...appLayout, ["back-to-top"]] : appLayout;
    }
    const { items, inputs } = inventory.getSnapshot();
    const continueRows =
      settings.getSnapshot().continueWatching && items.length ? [items.map((item) => "continue:" + item.key)] : [];
    const inputRows = inputs.length ? [inputs.map(sourceKey)] : [];
    return [...appLayout, ...continueRows, ...inputRows];
  };
  const focus = () => {
    if (document.hidden || runtime.settingsUi?.isOpen()) {
      update({ active: false });
      return;
    }
    const pending = state.getSnapshot();
    if (pending.moving && !ids().includes(pending.moving)) {
      update({ moving: null, draft: null });
      runtime.hideToast();
      cancelPress();
    }
    if (pending.menu && !ids().includes(pending.menu.id)) {
      update({ menu: null });
      cancelPress();
    }
    const list = rows();
    const old = state.getSnapshot().selected;
    const selected = getSelectedKey(list, old, started);
    if (list[1]?.length) {
      started = true;
    }
    if (old !== selected) {
      cancelPress();
    }
    update({ selected, active: true });
    const node = nodes.get(selected);
    const main = env.rows.current;
    if (!node || !main || runtime.settingsUi?.isOpen()) {
      return;
    }
    focusControl(node);
    const listNode = env.continueItems.current;
    if (selected.startsWith("continue:") && listNode) {
      const viewport = env.continueViewport.current;
      if (viewport) {
        const previous = state.getSnapshot().continueOffset;
        const offset = Math.max(
          0,
          Math.min(Math.max(previous, node.offsetLeft + node.offsetWidth - listNode.clientWidth), node.offsetLeft),
        );
        update({ continueOffset: offset });
      }
    }
    const mainTop = main.getBoundingClientRect().top;
    const lastAppRow = pending.page === "apps" ? list[list.length - 2] : undefined;
    const lastApp = lastAppRow && nodes.get(lastAppRow[0]);
    const grid = lastApp?.parentElement;
    // The grid edge stays fixed while the last app's focus scale animates.
    const lastRowTop = lastApp && grid ? grid.getBoundingClientRect().bottom - lastApp.offsetHeight - mainTop : 0;
    const appsEndOffset = Math.max(0, Math.round(lastRowTop - APPS_END_CLEARANCE));
    if (selected === "back-to-top" || (pending.scroll === pending.appsEndOffset && lastAppRow?.includes(selected))) {
      update({ appsEndOffset, scroll: appsEndOffset });
      return;
    }
    const rect = node.getBoundingClientRect();
    const origin = main.parentElement?.getBoundingClientRect().top || 0;
    const scroll = getScrollOffset({
      selected,
      rows: list,
      previous: pending.scroll,
      top: rect.top - mainTop + origin,
      bottom: rect.bottom - mainTop + origin,
      origin,
    });
    update({ appsEndOffset, scroll });
  };
  const select = (selected: string) => {
    if (state.getSnapshot().selected !== selected) {
      cancelPress();
    }
    update({ selected });
    focus();
  };
  const endMove = () => {
    const draft = state.getSnapshot().draft;
    if (draft) {
      settings.update({ home: [...homeIds()] });
    }
    update({ moving: null, draft: null });
    runtime.hideToast();
  };
  const dismiss = () => {
    update({ menu: null });
    focus();
  };
  const showPage = (page: Page) => {
    cancelPress();
    endMove();
    update({ page, appsEndOffset: 0, scroll: 0, menu: null, selected: page === "home" ? "home-tab" : "apps-tab" });
    focus();
  };
  const activate = (key: string) => {
    if (key === "gear") {
      endMove();
      runtime.settingsUi?.open();
    } else if (key === "samsung-home-shortcut") {
      if (runtime.homewatch.openSamsungHome) {
        runtime.homewatch.openSamsungHome();
      } else {
        runtime.homewatch.useSamsungHome();
      }
    } else if (key === "home-tab" || key === "apps-tab") {
      showPage(key === "home-tab" ? "home" : "apps");
    } else if (key === "back-to-top") {
      const first = inventory.getSnapshot().apps[0];
      if (first) {
        select("app:" + first.id);
      }
    } else if (key.startsWith("app:")) {
      const id = key.slice(4);
      const app = runtime.apps.byId(id);
      if (id === runtime.config.FIREPLACE_ID) {
        runtime.apps.playFireplace();
      } else if (app) {
        runtime.apps.launch(app);
      }
    } else if (key.startsWith("continue:")) {
      // Commands need the service's live record, not an immutable view snapshot.
      const item = runtime.continueWatching.items.find((item) => item.key === key.slice(9));
      if (item) {
        runtime.continueWatching.open(item);
      }
    } else {
      const source = inventory.getSnapshot().inputs.find((source) => sourceKey(source) === key);
      if (source) {
        runtime.inputs.show(source);
      }
    }
  };
  const menuChoices = (): readonly HomeMenuChoice[] => {
    if (state.getSnapshot().page === "home") {
      return HOME_MENU_CHOICES;
    }
    const selected = homeIds().includes(state.getSnapshot().menu?.id || "");
    return [selected ? APP_MENU_CHOICES.remove : APP_MENU_CHOICES.add];
  };
  const choose = (index: number) => {
    const menu = state.getSnapshot().menu;
    const choice = menuChoices()[index];
    if (!menu || !choice) {
      return;
    }
    update({ menu: null });
    if (choice.action === "move") {
      update({ moving: menu.id, draft: [...homeIds()] });
      env.showMoveInstructions();
      return;
    }
    const before = ids();
    const at = before.indexOf(menu.id);
    const home = [...homeIds()];
    settings.update({
      home: choice.action === "add" ? [...home, menu.id] : home.filter((id) => id !== menu.id),
    });
    if (state.getSnapshot().page === "home") {
      const after = ids();
      const nextApp = after[Math.min(Math.max(at, 0), after.length - 1)];
      const firstInput = inventory.getSnapshot().inputs[0];
      const fallback = firstInput ? sourceKey(firstInput) : "home-tab";
      update({ selected: nextApp ? "app:" + nextApp : fallback });
    }
    focus();
  };
  const K = runtime.config.KEY;
  const keydown = (code: number, event: Pick<KeyboardEvent, "preventDefault">) =>
    transaction(() => {
      const current = state.getSnapshot();
      const delta = code === K.LEFT || code === K.UP ? -1 : 1;
      if (![K.LEFT, K.RIGHT, K.UP, K.DOWN, K.BACK, K.ESC, K.ENTER].includes(code)) {
        return;
      }
      event.preventDefault();
      if (current.menu) {
        if (code === K.BACK || code === K.ESC) {
          dismiss();
        } else if (code === K.ENTER) {
          if (!enterDown) {
            enterDown = true;
            choose(current.menu.selected);
          }
        } else {
          update({
            menu: {
              ...current.menu,
              selected: Math.max(0, Math.min(menuChoices().length - 1, current.menu.selected + delta)),
            },
          });
        }
        return;
      }
      if (current.moving) {
        if (code === K.ENTER || code === K.BACK || code === K.ESC) {
          if (code !== K.ENTER || !enterDown) {
            enterDown = code === K.ENTER;
            endMove();
          }
          return;
        }
        const home = [...homeIds()];
        const from = home.indexOf(current.moving);
        const step = code === K.UP || code === K.DOWN ? env.columns(settings.getSnapshot()) : 1;
        const to = Math.max(0, Math.min(home.length - 1, from + delta * step));
        update({ draft: moveItem(home, from, to, current.moving) });
        focus();
        return;
      }
      if (code === K.ENTER) {
        if (enterDown) {
          return;
        }
        enterDown = true;
        const selected = current.selected;
        timer = window.setTimeout(() => {
          timer = undefined;
          if (enterDown && selected.startsWith("app:")) {
            update({ menu: { id: selected.slice(4), selected: 0 } });
          }
        }, runtime.config.LONG_PRESS_MS);
        return;
      }
      if (code === K.BACK || code === K.ESC) {
        if (current.page !== "home") {
          showPage("home");
        }
        return;
      }
      const all = rows();
      const row = all.findIndex((items) => items.includes(current.selected));
      if (row < 0) {
        focus();
        return;
      }
      const horizontal = code === K.LEFT || code === K.RIGHT;
      const target = horizontal ? row : row + delta;
      if (target < 0 || target >= all.length) {
        return;
      }
      const column = horizontal
        ? all[row].indexOf(current.selected) + delta
        : getVerticalColumn({
            rows: all,
            row,
            target,
            selected: current.selected,
            page: current.page,
            nodes,
            viewport: env.continueViewport.current,
          });
      select(all[target][Math.max(0, Math.min(all[target].length - 1, column))]);
    });
  const keyup = (code: number) => {
    if (code !== K.ENTER) {
      return;
    }
    enterDown = false;
    if (timer === undefined) {
      return;
    }
    window.clearTimeout(timer);
    timer = undefined;
    if (!state.getSnapshot().menu && !state.getSnapshot().moving) {
      activate(state.getSnapshot().selected);
    }
  };
  const bridge = {
    render: focus,
    buildRows: focus,
    refreshApps: focus,
    focus,
    blur() {
      cancelPress();
      update({ active: false, menu: null });
    },
    keydown,
    keyup,
  };
  return { ...env, state, bridge, select, activate, showPage, choose, dismiss, menuChoices };
};
