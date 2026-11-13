import type { RefObject } from "preact";
import { flushSync } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";

import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useInputScope } from "../../../shared/input/useInputScope";
import { focusControl } from "../../../shared/navigation/focusControl";
import type { HomeEnvironment, HomeState } from "../../types";

const TAB_KEY_CODE = 9;

export const useAppActionsMenuInput = (
  env: HomeEnvironment,
  menu: HomeState["menu"],
  panel: RefObject<HTMLDivElement>,
  choiceCount: number,
) => {
  const [index, setIndex] = useState(0);
  const active = useStoreSelector(env.state, (current) => current.active);
  const selected = Math.max(0, Math.min(choiceCount - 1, index));
  useInputScope({
    modal: true,
    subscribe: env.state.subscribe,
    isActive: () => {
      const current = env.state.getSnapshot();
      return current.active && current.menu !== null;
    },
    handle({ action, code, phase }) {
      if (phase === "up") {
        return "native";
      }
      if (action === "back" || code === TAB_KEY_CODE) {
        env.dismiss();
      } else if (action === "confirm") {
        env.choose(selected);
      } else if (action === "up" || action === "down" || action === "left" || action === "right") {
        const rtl = document.documentElement.dir === "rtl";
        const delta = action === "up" || (action === "left" && !rtl) || (action === "right" && rtl) ? -1 : 1;
        flushSync(() => setIndex((current) => Math.max(0, Math.min(choiceCount - 1, current + delta))));
      } else {
        return "native";
      }
      return "handled";
    },
  });
  useLayoutEffect(() => {
    setIndex(0);
  }, [menu]);
  useLayoutEffect(() => {
    if (menu && active) {
      focusControl(panel.current);
    }
  }, [menu, active, panel]);
  return selected;
};
