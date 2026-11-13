import type { RefObject } from "preact";
import { flushSync } from "preact/compat";
import { useCallback, useLayoutEffect } from "preact/hooks";

import { useInputScope } from "../../../shared/input/useInputScope";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";
import { useSettingsNavigationOwner } from "../../hooks/useSettingsNavigationOwner";

const NATIVE_CONFIRM_KEY = "Enter";

interface Options {
  active: boolean;
  autoFocus: boolean;
  input: RefObject<HTMLInputElement>;
  onSubmit?(): void;
}

export const useTextInputScope = ({ active, autoFocus, input, onSubmit }: Options) => {
  const { services } = useSettingsEnvironment();
  const navigation = useSettingsNavigationOwner();
  const subscribe = useCallback(
    (listener: () => void) => {
      const field = input.current;
      field?.addEventListener("focus", listener);
      field?.addEventListener("blur", listener);
      return () => {
        field?.removeEventListener("focus", listener);
        field?.removeEventListener("blur", listener);
      };
    },
    [input],
  );
  useInputScope({
    allowActionRepeats: true,
    isActive: () => active && input.current !== null && document.activeElement === input.current,
    subscribe,
    onCancel() {
      if (document.activeElement === input.current) {
        input.current?.blur();
      }
    },
    handle({ action, code, nativeEvent, phase }) {
      if (phase === "up" || (nativeEvent.isComposing && action !== "done")) {
        return "native";
      }
      const submit = code === services.config.KEY.ENTER || nativeEvent.key === NATIVE_CONFIRM_KEY || action === "done";
      if (!submit && action !== "back" && action !== "cancel") {
        return "native";
      }
      flushSync(() => {
        input.current?.blur();
        if (submit) {
          onSubmit?.();
        }
        navigation.focus();
      });
      return "handled";
    },
  });
  useLayoutEffect(() => {
    if (active && autoFocus) {
      input.current?.focus();
    }
  }, [active, autoFocus, input]);
};
