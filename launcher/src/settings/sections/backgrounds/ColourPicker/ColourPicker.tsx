import { ChevronLeft, ChevronRight } from "lucide-preact";
import { useLayoutEffect } from "preact/hooks";

import type { ColourChannels } from "../../../../backgrounds/colours";
import { channelsToColour } from "../../../../backgrounds/colours";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { Icon } from "../../../../shared/icons/Icon/Icon";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";
import { useSettingsEnvironment } from "../../../hooks/useSettingsEnvironment";
import { COLOUR_CONTROLS } from "../../../state/colourPicker";

import styles from "./ColourPicker.module.css";

export const ColourPicker = ({ colour }: { colour: ColourChannels }) => {
  const { t } = useTranslation();
  const { services, actions } = useSettingsEnvironment();
  const hex = channelsToColour(colour);
  useLayoutEffect(() => services.previewColour(hex), [hex, services]);
  useLayoutEffect(() => () => services.previewColour(null), [services]);
  return (
    <section
      class={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="colour-picker-title"
      data-colour-picker
    >
      <h2 id="colour-picker-title">{t("scene.custom")}</h2>
      <p class={styles.hint}>{t("wallpaper.colourHint")}</p>
      <div class={styles.controls}>
        {COLOUR_CONTROLS.map((control) => {
          const label = t(control.labelKey);
          const value = Math.round(colour[control.value]);
          const start = channelsToColour({ ...colour, [control.value]: 0 });
          const end = channelsToColour({ ...colour, [control.value]: control.max });
          const middle = channelsToColour({ ...colour, lightness: 50 });
          let background = `linear-gradient(to right, ${start}, ${end})`;
          if (control.value === "hue") {
            background = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
          } else if (control.value === "lightness") {
            background = `linear-gradient(to right, #000, ${middle}, #fff)`;
          }
          return (
            <SettingsControl
              key={control.value}
              class={styles.control}
              focusKey={"colour:" + control.value}
              role="slider"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={control.max}
              aria-valuenow={value}
              aria-valuetext={value + control.unit}
            >
              <div class={styles.label}>
                <span>{label}</span>
                <span>
                  {value}
                  {control.unit}
                </span>
              </div>
              <div class={styles.adjustment}>
                <button
                  type="button"
                  class={styles.arrow}
                  tabIndex={-1}
                  aria-label={t("wallpaper.decreaseColour", { name: label })}
                  onClick={() => actions.adjustColour(control.value, -1)}
                >
                  <Icon icon={ChevronLeft} />
                </button>
                <div class={styles.track} style={{ background }} aria-hidden="true">
                  <span class={styles.thumb} style={{ left: (value / control.max) * 100 + "%" }} />
                </div>
                <button
                  type="button"
                  class={styles.arrow}
                  tabIndex={-1}
                  aria-label={t("wallpaper.increaseColour", { name: label })}
                  onClick={() => actions.adjustColour(control.value, 1)}
                >
                  <Icon icon={ChevronRight} />
                </button>
              </div>
            </SettingsControl>
          );
        })}
      </div>
      <div class={styles.actions}>
        <SettingsControl
          class={styles.action}
          focusKey="colour:apply"
          role="button"
          onClick={() => actions.closeColourPicker(true)}
        >
          {t("wallpaper.applyColour")}
        </SettingsControl>
        <SettingsControl
          class={styles.action}
          focusKey="colour:cancel"
          role="button"
          onClick={() => actions.closeColourPicker(false)}
        >
          {t("wallpaper.cancelColour")}
        </SettingsControl>
      </div>
    </section>
  );
};
