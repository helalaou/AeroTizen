import { flushSync } from "preact/compat";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import type { Direction } from "../../shared/navigation/createNavigation";
import { categories } from "../layout/categories";
import type { SettingsInventorySnapshot } from "../types";

import { useSettingsEnvironment } from "./useSettingsEnvironment";

interface Layout extends SettingsInventorySnapshot {
  animated: boolean;
  continueEnabled: boolean;
  locationLabel?: string;
}
const SPACE_KEY = 32;

export const useSettingsNavigation = (
  active: boolean,
  previewing: boolean,
  { apps, inputs, continueSources, continueMessage, continueEnabled, animated, locationLabel }: Layout,
) => {
  const { language } = useTranslation();
  const {
    navigation,
    bridge,
    services,
    actions,
    settings,
    view,
    root,
    drawer,
    categoryMenu,
    categoryContent,
    categoryScroll,
    panes,
  } = useSettingsEnvironment();
  const directions = useMemo<Partial<Record<number, Direction>>>(() => {
    const { KEY } = services.config;
    return { [KEY.LEFT]: "left", [KEY.RIGHT]: "right", [KEY.UP]: "up", [KEY.DOWN]: "down" };
  }, [services.config]);
  const category = useStore(drawer);
  const previousDrawer = useRef<typeof category>();
  useLayoutEffect(() => {
    if (active && !previousDrawer.current && category.expanded) {
      drawer.set({ ...category, expanded: false });
    }
    navigation.invalidate();
    navigation.setScope?.(category.expanded ? categoryContent.current : categoryMenu.current);
    if (previousDrawer.current !== category) {
      if (categoryScroll.current) {
        categoryScroll.current.scrollTop = 0;
      }
      const key = category.expanded
        ? navigation.firstKey(panes.get(category.category)) || "settings-close"
        : "section:" + category.category;
      navigation.reset(key);
    }
    previousDrawer.current = active ? category : undefined;
    if (active && !previewing) {
      navigation.focus();
    } else {
      navigation.clear();
    }
  }, [
    active,
    previewing,
    apps,
    inputs,
    continueSources,
    continueMessage,
    continueEnabled,
    animated,
    locationLabel,
    language,
    navigation,
    settings,
    category,
    drawer,
    categoryContent,
    categoryMenu,
    categoryScroll,
    panes,
  ]);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const resize = () => {
      navigation.invalidate();
      if (!view.getSnapshot().previewing) {
        flushSync(() => navigation.focus());
      }
    };
    window.addEventListener("resize", resize);
    const unregister = bridge.register({
      focus: () => {
        flushSync(() => navigation.focus());
      },
      blur: () => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && root.current?.contains(activeElement)) {
          activeElement.blur();
        }
        navigation.clear();
      },
      keydown: (code, event) => {
        const K = services.config.KEY;
        // Remote input and native focus can arrive before the next render.
        const currentDrawer = drawer.getSnapshot();
        if (view.getSnapshot().previewing) {
          event.preventDefault();
          flushSync(() => view.set({ ...view.getSnapshot(), previewing: false }));
          return;
        }
        const current = navigation.current();
        // The sidebar sits on the right in right-to-left languages, so the keys that
        // open a section and return to the sidebar swap sides with it.
        const rtl = document.documentElement.dir === "rtl";
        const into = rtl ? K.LEFT : K.RIGHT;
        const out = rtl ? K.RIGHT : K.LEFT;
        if (!currentDrawer.expanded) {
          event.preventDefault();
          if (code === K.BACK || code === K.ESC) {
            bridge.close();
          } else if (code === K.UP || code === K.DOWN) {
            flushSync(() => {
              navigation.move(code === K.UP ? "up" : "down");
              const next = categories.find((item) => navigation.getSnapshot() === "section:" + item.id);
              if (next && next.id !== currentDrawer.category) {
                drawer.set({ category: next.id, expanded: false });
              }
            });
          } else if (current?.id === "escape") {
            if (code === K.ENTER || code === SPACE_KEY) {
              current.click();
            }
          } else if (code === into || code === K.ENTER || code === SPACE_KEY) {
            const focusedCategory = categories.find((item) => current?.dataset.key === "section:" + item.id);
            flushSync(() => drawer.set({ category: focusedCategory?.id ?? currentDrawer.category, expanded: true }));
          }
          return;
        }
        const pane = categoryContent.current?.getBoundingClientRect();
        const atSidebarEdge = (box: DOMRect) =>
          rtl ? box.right >= (pane?.right || 0) - 64 : box.left <= (pane?.left || 0) + 64;
        const leavesPane =
          code === out &&
          current &&
          (atSidebarEdge(current.getBoundingClientRect()) ||
            (current.dataset.key === "settings-close" && !navigation.firstKey(panes.get(currentDrawer.category))));
        if ((code === K.BACK || code === K.ESC || leavesPane) && !view.getSnapshot().adjusting) {
          event.preventDefault();
          flushSync(() => drawer.set({ ...currentDrawer, expanded: false }));
          return;
        }
        if (view.getSnapshot().adjusting) {
          const setAdjusting = (adjusting: boolean) => flushSync(() => view.set({ ...view.getSnapshot(), adjusting }));
          if (current?.dataset.key === "speed" && (code === K.LEFT || code === K.RIGHT)) {
            event.preventDefault();
            actions.setSpeed(code === K.LEFT ? -1 : 1);
            return;
          }
          setAdjusting(false);
          // OK and Back only leave the slider; Up and Down leave it and move on.
          if (code === K.ENTER || code === K.BACK || code === K.ESC) {
            event.preventDefault();
            return;
          }
        }
        if (code === K.BACK || code === K.ESC) {
          event.preventDefault();
          bridge.close();
          return;
        }
        if (code === K.ENTER || (code === SPACE_KEY && current?.getAttribute("role") === "button")) {
          event.preventDefault();
          current?.click();
          return;
        }
        const direction = directions[code];
        if (direction) {
          event.preventDefault();
          flushSync(() => navigation.move(direction));
        }
      },
    });
    return () => {
      unregister();
      window.removeEventListener("resize", resize);
      navigation.clear();
    };
  }, [active, actions, bridge, navigation, root, services, view, drawer, categoryContent, directions, panes]);
};
