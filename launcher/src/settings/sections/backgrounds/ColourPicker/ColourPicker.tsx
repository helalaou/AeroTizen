import { useLayoutEffect, useMemo } from "preact/hooks";

import { channelsToColour } from "../../../../backgrounds/colours";
import { gradientBackground } from "../../../../backgrounds/gradients";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { SelectionIndicator } from "../../../components/SelectionIndicator/SelectionIndicator";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";
import { SettingsHeading } from "../../../components/SettingsHeading/SettingsHeading";
import { SettingsPanel } from "../../../components/SettingsPanel/SettingsPanel";
import { useSettingsEnvironment } from "../../../hooks/useSettingsEnvironment";
import type { ColourPickerDraft } from "../../../state/colourPicker";
import { activeColour, COLOUR_CONTROLS, colourChannelValue, draftBackground } from "../../../state/colourPicker";
import { ColourSlider } from "../ColourSlider/ColourSlider";

import styles from "./ColourPicker.module.css";

const GRADIENT_STOPS = [
  { value: 0, labelKey: "wallpaper.firstColour" },
  { value: 1, labelKey: "wallpaper.secondColour" },
] as const;

export const ColourPicker = ({ draft }: { draft: ColourPickerDraft }) => {
  const { t } = useTranslation();
  const { services, actions } = useSettingsEnvironment();
  const preview = useMemo(() => draftBackground(draft), [draft]);
  const colour = activeColour(draft);
  const gradient = draft.kind === "gradient";
  useLayoutEffect(() => services.previewBackground(preview), [preview, services]);
  useLayoutEffect(() => () => services.previewBackground(null), [services]);
  return (
    <SettingsPanel
      class={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="colour-picker-title"
      aria-describedby="colour-picker-hint"
      data-colour-picker
      data-gradient={gradient ? "true" : undefined}
    >
      <SettingsHeading
        class={styles.heading}
        id="colour-picker-title"
        title={t(gradient ? "scene.custom-gradient" : "scene.custom")}
        description={t(gradient ? "wallpaper.gradientHint" : "wallpaper.colourHint")}
        descriptionId="colour-picker-hint"
      />
      {draft.kind === "gradient" ? (
        <div class={styles.stops}>
          {GRADIENT_STOPS.map((stop) => (
            <SettingsControl
              key={stop.value}
              class={styles.stop}
              focusKey={"gradient:stop:" + stop.value}
              role="button"
              aria-pressed={draft.activeStop === stop.value}
              onClick={() => actions.setGradientStop(stop.value)}
            >
              <span
                class={styles.sample}
                style={{ background: channelsToColour(draft.colours[stop.value]) }}
                aria-hidden="true"
              />
              <span>{t(stop.labelKey)}</span>
              {draft.activeStop === stop.value ? <SelectionIndicator small /> : null}
            </SettingsControl>
          ))}
        </div>
      ) : null}
      <div class={styles.controls}>
        {COLOUR_CONTROLS.map((control) => {
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
            <ColourSlider
              key={control.value}
              background={background}
              compact={gradient}
              focusKey={"colour:" + control.value}
              label={t(control.labelKey)}
              max={control.max}
              onAdjust={(direction) => actions.adjustColour(control.value, direction)}
              unit={control.unit}
              value={colourChannelValue(colour, control.value)}
            />
          );
        })}
        {draft.kind === "gradient" && preview.kind === "gradient" ? (
          <ColourSlider
            background={gradientBackground(preview.gradient)}
            compact
            focusKey="gradient:angle"
            label={t("wallpaper.direction")}
            max={359}
            onAdjust={actions.adjustGradientAngle}
            unit="°"
            value={draft.angle}
          />
        ) : null}
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
    </SettingsPanel>
  );
};
