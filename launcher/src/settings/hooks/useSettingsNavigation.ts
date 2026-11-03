import { flushSync } from "preact/compat";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import type { Direction } from "../../shared/navigation/createNavigation";
import { categories } from "../layout/categories";
import type { SettingsInventorySnapshot } from "../types";

import { useSettingsEnvironment } from "./useSettingsEnvironment";

interface Layout extends SettingsInventorySnapshot {
  animated: boolean;
  clockLayout?: string;
  continueEnabled: boolean;
  locationLabel?: string;
}
const SPACE_KEY = 32;

export const useSettingsNavigation = (
  active: boolean,
  previewing: boolean,
  { apps, inputs, continueSources, continueMessage, continueEnabled, animated, locationLabel, clockLayout }: Layout,
) => {
  const { navigation, bridge, services, actions, settings, view, root, drawer, categoryMenu, categoryContent, panes } =
    useSettingsEnvironment();
  const directions = useMemo<Partial<Record<number, Direction>>>(() => {
    const { KEY } = services.config;
    return { [KEY.LEFT]: "left", [KEY.RIGHT]: "right", [KEY.UP]: "up", [KEY.DOWN]: "down" };
  }, [services.config]);
  const wasOpen = useRef(false);
  const previousScope = useRef("");
  const category = useStore(drawer);
  useLayoutEffect(() => {
    if (active && !wasOpen.current && category.expanded) {
      drawer.set({ ...category, expanded: false });
    }
    navigation.invalidate();
    navigation.setScope?.(category.expanded ? categoryContent.current : categoryMenu.current);
    const scope = category.category + ":" + category.expanded;
    if (!wasOpen.current || previousScope.current !== scope) {
      const key = category.expanded
        ? navigation.firstKey(panes.get(category.category)) || "settings-close"
        : "section:" + category.category;
      navigation.reset(key);
    }
    previousScope.current = scope;
    wasOpen.current = active;
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
    clockLayout,
    navigation,
    settings,
    category,
    drawer,
    categoryContent,
    categoryMenu,
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
        if (view.getSnapshot().previewing) {
          event.preventDefault();
          flushSync(() => view.set({ ...view.getSnapshot(), previewing: false }));
          return;
        }
        const current = navigation.current();
        if (!category.expanded) {
          event.preventDefault();
          if (code === K.BACK || code === K.ESC) {
            bridge.close();
          } else if (code === K.RIGHT || code === K.ENTER || code === SPACE_KEY) {
            flushSync(() => drawer.set({ ...category, expanded: true }));
          } else if (code === K.UP || code === K.DOWN) {
            const index = categories.findIndex((item) => item.id === category.category);
            const next = categories[Math.max(0, Math.min(categories.length - 1, index + (code === K.UP ? -1 : 1)))];
            flushSync(() => drawer.set({ category: next.id, expanded: false }));
          }
          return;
        }
        if (
          (code === K.BACK ||
            code === K.ESC ||
            (code === K.LEFT &&
              current &&
              current.getBoundingClientRect().left <=
                (categoryContent.current?.getBoundingClientRect().left || 0) + 64)) &&
          !view.getSnapshot().adjusting
        ) {
          event.preventDefault();
          flushSync(() => drawer.set({ ...category, expanded: false }));
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
  }, [active, actions, bridge, navigation, root, services, view, category, drawer, categoryContent, directions]);
};
