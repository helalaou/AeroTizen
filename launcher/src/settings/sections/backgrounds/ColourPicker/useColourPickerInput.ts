import { flushSync } from "preact/compat";
import { useLayoutEffect, useMemo } from "preact/hooks";

import { useInputScope } from "../../../../shared/input/useInputScope";
import { createNavigation } from "../../../../shared/navigation/createNavigation";
import { focusControl } from "../../../../shared/navigation/focusControl";
import { useSettingsEnvironment } from "../../../hooks/useSettingsEnvironment";
import type { ColourPickerDraft } from "../../../state/colourPicker";

const ENTRY_FOCUS = { solid: "colour:hue", gradient: "gradient:stop:0" } as const;

export const useColourPickerInput = (kind: ColourPickerDraft["kind"]) => {
  const { actions } = useSettingsEnvironment();
  const navigation = useMemo(() => createNavigation(focusControl), []);
  const scope = useInputScope({
    modal: true,
    handle(event) {
      if (event.phase === "up") {
        return "native";
      }
      const { action } = event;
      if (action === "back") {
        actions.closeColourPicker(false);
      } else if (action === "confirm") {
        navigation.current()?.click();
      } else if (action === "left" || action === "right" || action === "up" || action === "down") {
        flushSync(() => navigation.move(action));
      } else {
        return "native";
      }
      return "handled";
    },
  });
  useLayoutEffect(() => {
    navigation.reset(ENTRY_FOCUS[kind]);
    navigation.focus();
    const resize = () => {
      navigation.invalidate();
      navigation.focus();
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      navigation.clear();
    };
  }, [navigation, kind]);
  return { navigation, scope };
};
