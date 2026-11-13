import { ChevronLeft, ChevronRight } from "lucide-preact";
import { flushSync } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";

import { useStoreSelector } from "../../../../shared/hooks/useStore";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { Icon } from "../../../../shared/icons/Icon/Icon";
import { useInputScope } from "../../../../shared/input/useInputScope";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";
import { useSettingsNavigationOwner } from "../../../hooks/useSettingsNavigationOwner";

import styles from "./SpeedSlider.module.css";

interface Props {
  active: boolean;
  max: number;
  min: number;
  onAdjust(direction: number): void;
  value: number;
}

const FOCUS_KEY = "speed";

export const SpeedSlider = ({ active, max, min, onAdjust, value }: Props) => {
  const { t } = useTranslation();
  const navigation = useSettingsNavigationOwner();
  const focused = useStoreSelector(navigation, (key) => key === FOCUS_KEY);
  const [adjusting, setAdjusting] = useState(false);
  const stopAdjusting = () => flushSync(() => setAdjusting(false));
  useInputScope({
    isActive: () => active && adjusting && navigation.getSnapshot() === FOCUS_KEY,
    subscribe: navigation.subscribe,
    onCancel: stopAdjusting,
    handle({ action, phase }) {
      if (phase === "up") {
        return "native";
      }
      if (action === "left" || action === "right") {
        onAdjust(action === "left" ? -1 : 1);
        return "handled";
      }
      stopAdjusting();
      // Confirm and Back leave edit mode. Other keys return to drawer navigation.
      return action === "confirm" || action === "back" ? "handled" : "unhandled";
    },
  });
  useLayoutEffect(() => {
    if (!active || !focused) {
      setAdjusting(false);
    }
  }, [active, focused]);
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <SettingsControl
      class={styles.slider}
      data-adjusting={adjusting ? "true" : undefined}
      focusKey={FOCUS_KEY}
      role="slider"
      aria-label={t("wallpaper.speedLabel")}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onClick={() => flushSync(() => setAdjusting((current) => !current))}
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
