import type { JSX } from "preact";
import { flushSync } from "preact/compat";
import { useCallback, useContext, useLayoutEffect, useRef } from "preact/hooks";

import { focusControl } from "../../shared/navigation/focusControl";
import { FocusedControlContext } from "../context";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";

interface Props extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "ref"> {
  class?: string;
  focusKey: string;
}

// Focus is rendered from state. Refs supply nodes for measurement and browser focus.
export const SettingsControl = ({ focusKey, class: className = "", onClick, onFocusCapture, ...props }: Props) => {
  const { navigation } = useSettingsEnvironment();
  const focused = useContext(FocusedControlContext) === focusKey;
  const ref = useRef<HTMLDivElement>(null);
  const register = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      navigation.register(focusKey, node);
    },
    [navigation, focusKey],
  );
  useLayoutEffect(() => {
    if (focused) {
      focusControl(ref.current);
    }
  }, [focused]);
  const select = () => flushSync(() => navigation.select(focusKey));
  return (
    <div
      {...props}
      ref={register}
      data-key={focusKey}
      tabIndex={focused ? 0 : -1}
      onClick={(event) => {
        select();
        onClick?.(event);
      }}
      onFocusCapture={(event) => {
        select();
        onFocusCapture?.(event);
      }}
      class={className + (focused ? " focused" : "")}
    />
  );
};
