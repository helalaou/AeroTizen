import { ChevronLeft, ChevronRight } from "lucide-preact";

import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsControl } from "../SettingsControl/SettingsControl";

import styles from "./SettingsSlider.module.css";
import { SliderStepButton } from "./SliderStepButton";
import type { SliderInputOptions } from "./useSliderInput";
import { useSliderInput } from "./useSliderInput";

interface Props extends SliderInputOptions {
  ariaLabel?: string;
  background?: string;
  compact?: boolean;
  label: string;
  max: number;
  min?: number;
  unit: string;
  value: number;
}

export const SettingsSlider = ({
  accelerate,
  active,
  ariaLabel,
  background,
  compact = false,
  focusKey,
  label,
  max,
  min = 0,
  onAdjust,
  unit,
  value,
}: Props) => {
  const { t } = useTranslation();
  const adjustWithPointer = useSliderInput({
    accelerate,
    active,
    focusKey,
    onAdjust,
  });
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const accessibleLabel = ariaLabel ?? label;
  return (
    <SettingsControl
      class={styles.control}
      data-compact={compact ? "true" : undefined}
      focusKey={focusKey}
      role="slider"
      aria-label={accessibleLabel}
      aria-valuemin={min}
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
        <SliderStepButton
          direction={-1}
          icon={ChevronLeft}
          label={t("common.decrease", { name: accessibleLabel })}
          onAdjust={adjustWithPointer}
        />
        <div class={styles.track} style={{ background }} aria-hidden="true">
          <span class={styles.thumb} style={{ left: percent + "%" }} />
        </div>
        <SliderStepButton
          direction={1}
          icon={ChevronRight}
          label={t("common.increase", { name: accessibleLabel })}
          onAdjust={adjustWithPointer}
        />
      </div>
    </SettingsControl>
  );
};
