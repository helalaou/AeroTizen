import { ChevronLeft, ChevronRight } from "lucide-preact";
import { useLayoutEffect, useMemo } from "preact/hooks";

import { useStoreSelector } from "../../../../shared/hooks/useStore";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { Icon } from "../../../../shared/icons/Icon/Icon";
import { useInputScope } from "../../../../shared/input/useInputScope";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";
import { useSettingsNavigationOwner } from "../../../hooks/useSettingsNavigationOwner";
import { createKeyAcceleration } from "../../../state/createKeyAcceleration";

import styles from "./ColourSlider.module.css";

interface Props {
  background: string;
  compact?: boolean;
  focusKey: string;
  label: string;
  max: number;
  onAdjust(direction: number): void;
  unit: string;
  value: number;
}

export const ColourSlider = ({ background, compact = false, focusKey, label, max, onAdjust, unit, value }: Props) => {
  const { t } = useTranslation();
  const navigation = useSettingsNavigationOwner();
  const focused = useStoreSelector(navigation, (key) => key === focusKey);
  const acceleration = useMemo(() => createKeyAcceleration(), []);
  useInputScope({
    isActive: () => navigation.getSnapshot() === focusKey,
    onCancel: acceleration.reset,
    handle(event) {
      if (event.phase === "up" || (event.action !== "left" && event.action !== "right")) {
        acceleration.reset();
        return "unhandled";
      }
      const direction = event.action === "left" ? -1 : 1;
      onAdjust(direction * acceleration.step(event.action, focusKey));
      return "handled";
    },
  });
  useLayoutEffect(() => {
    if (!focused) {
      acceleration.reset();
    }
  }, [focused, acceleration]);
  return (
    <SettingsControl
      class={styles.control}
      data-compact={compact ? "true" : undefined}
      focusKey={focusKey}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={value + unit}
    >
      <div class={styles.label}>
        <span>{label}</span>
        <span>
          {value}
          {unit}
        </span>
      </div>
      <div class={styles.adjustment}>
        <button
          type="button"
          class={styles.arrow}
          tabIndex={-1}
          aria-label={t("wallpaper.decreaseColour", { name: label })}
          onClick={() => onAdjust(-1)}
        >
          <Icon icon={ChevronLeft} />
        </button>
        <div class={styles.track} style={{ background }} aria-hidden="true">
          <span class={styles.thumb} style={{ left: (value / max) * 100 + "%" }} />
        </div>
        <button
          type="button"
          class={styles.arrow}
          tabIndex={-1}
          aria-label={t("wallpaper.increaseColour", { name: label })}
          onClick={() => onAdjust(1)}
        >
          <Icon icon={ChevronRight} />
        </button>
      </div>
    </SettingsControl>
  );
};
