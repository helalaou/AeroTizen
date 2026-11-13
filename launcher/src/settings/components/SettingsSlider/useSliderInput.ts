import { flushSync } from "preact/compat";
import { useLayoutEffect, useMemo } from "preact/hooks";

import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useInputScope } from "../../../shared/input/useInputScope";
import { useSettingsNavigationOwner } from "../../hooks/useSettingsNavigationOwner";
import { createKeyAcceleration } from "../../state/createKeyAcceleration";

export interface SliderInputOptions {
  accelerate?: boolean;
  active?: boolean;
  focusKey: string;
  onAdjust(steps: number): void;
}

export const useSliderInput = ({ accelerate = false, active = true, focusKey, onAdjust }: SliderInputOptions) => {
  const navigation = useSettingsNavigationOwner();
  const focused = useStoreSelector(navigation, (key) => key === focusKey);
  const acceleration = useMemo(() => createKeyAcceleration(), []);
  useInputScope({
    isActive: () => active && navigation.getSnapshot() === focusKey,
    subscribe: navigation.subscribe,
    onCancel: acceleration.reset,
    handle({ action, phase }) {
      if (phase === "up" || (action !== "left" && action !== "right")) {
        acceleration.reset();
        return "unhandled";
      }
      const direction = action === "left" ? -1 : 1;
      onAdjust(direction * (accelerate ? acceleration.step(action, focusKey) : 1));
      return "handled";
    },
  });
  useLayoutEffect(() => {
    if (!active || !focused) {
      acceleration.reset();
    }
  }, [active, focused, acceleration]);
  return (direction: number) => {
    if (active) {
      flushSync(() => {
        navigation.select(focusKey);
        navigation.focus();
        acceleration.reset();
        onAdjust(direction);
      });
    }
  };
};
