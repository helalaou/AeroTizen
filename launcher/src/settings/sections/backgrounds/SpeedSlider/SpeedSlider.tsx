import { ChevronLeft, ChevronRight } from "lucide-preact";

import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { Icon } from "../../../../shared/icons/Icon/Icon";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";

import styles from "./SpeedSlider.module.css";

interface Props {
  adjusting: boolean;
  max: number;
  min: number;
  onSelect(): void;
  value: number;
}

export const SpeedSlider = ({ adjusting, max, min, onSelect, value }: Props) => {
  const { t } = useTranslation();
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <SettingsControl
      class={styles.slider}
      data-adjusting={adjusting ? "true" : undefined}
      focusKey="speed"
      role="slider"
      aria-label={t("wallpaper.speedLabel")}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onClick={onSelect}
    >
      <span class={styles.label}>{t("wallpaper.speed")}</span>
      <div class={styles.track}>
        <div class={styles.fill} style={{ width: percent + "%" }} />
        <div class={styles.thumb} style={{ left: percent + "%" }} />
      </div>
      <span class={styles.value}>{value}×</span>
      <span class={styles.hint} data-slider-hint>
        {adjusting ? (
          <>
            <Icon icon={ChevronLeft} />
            <Icon icon={ChevronRight} />
          </>
        ) : (
          t("wallpaper.adjust")
        )}
      </span>
    </SettingsControl>
  );
};
