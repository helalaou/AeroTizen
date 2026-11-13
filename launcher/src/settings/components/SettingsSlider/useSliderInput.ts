import { flushSync } from "preact/compat";
import { useLayoutEffect, useMemo, useState } from "preact/hooks";

import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useInputScope } from "../../../shared/input/useInputScope";
import { useSettingsNavigationOwner } from "../../hooks/useSettingsNavigationOwner";
import { createKeyAcceleration } from "../../state/createKeyAcceleration";

export interface SliderInputOptions {
  accelerate?: boolean;
  activation?: "focus" | "confirm";
  active?: boolean;
  focusKey: string;
  onAdjust(steps: number): void;
}

export const useSliderInput = ({
  accelerate = false,
  activation = "focus",
  active = true,
  focusKey,
  onAdjust,
}: SliderInputOptions) => {
  const navigation = useSettingsNavigationOwner();
  const focused = useStoreSelector(navigation, (key) => key === focusKey);
  const [adjusting, setAdjusting] = useState(false);
  const acceleration = useMemo(() => createKeyAcceleration(), []);
  const stopAdjusting = () => {
    acceleration.reset();
    flushSync(() => setAdjusting(false));
  };
  useInputScope({
    isActive: () => active && navigation.getSnapshot() === focusKey && (activation === "focus" || adjusting),
    subscribe: navigation.subscribe,
    onCancel: stopAdjusting,
    handle({ action, phase }) {
      if (phase === "up") {
        acceleration.reset();
        return "unhandled";
      }
      if (action === "left" || action === "right") {
        const direction = action === "left" ? -1 : 1;
        onAdjust(direction * (accelerate ? acceleration.step(action, focusKey) : 1));
        return "handled";
      }
      stopAdjusting();
      if (activation === "confirm" && (action === "confirm" || action === "back")) {
        return "handled";
      }
      return "unhandled";
    },
  });
  useLayoutEffect(() => {
    if (!active || !focused) {
      acceleration.reset();
      setAdjusting(false);
    }
  }, [active, focused, acceleration]);
  return {
    adjusting,
    toggleAdjusting() {
      if (active && activation === "confirm") {
        flushSync(() => setAdjusting((current) => !current));
      }
    },
    adjustWithPointer(direction: number) {
      if (active) {
        flushSync(() => {
          navigation.select(focusKey);
          navigation.focus();
          if (activation === "confirm") {
            setAdjusting(true);
          }
          acceleration.reset();
          onAdjust(direction);
        });
      }
    },
  };
};
