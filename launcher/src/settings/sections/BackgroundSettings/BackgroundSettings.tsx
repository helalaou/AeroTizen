import { Play } from "lucide-preact";
import { flushSync } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";

import { normalizeColour } from "../../../backgrounds/colours";
import { gradientBackground } from "../../../backgrounds/gradients";
import type { BackgroundOption, LauncherConfig } from "../../../contracts/launcher";
import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon/Icon";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { ChoiceOption } from "../../components/ChoiceOption/ChoiceOption";
import { SettingsHint } from "../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";
import type { SettingsSectionProps } from "../../types";
import { SpeedSlider } from "../backgrounds/SpeedSlider/SpeedSlider";
import { WallpaperSwatch } from "../backgrounds/WallpaperSwatch/WallpaperSwatch";

import styles from "./BackgroundSettings.module.css";

const WALLPAPER_CATEGORY_OPTIONS = [
  { value: "photo", labelKey: "wallpaper.photos" },
  { value: "solid", labelKey: "wallpaper.solid" },
  { value: "gradient", labelKey: "wallpaper.gradients" },
  { value: "animated", labelKey: "wallpaper.animated" },
] as const;

const WEATHER_PHOTO_OPTIONS = [
  { value: false, labelKey: "common.off" },
  { value: true, labelKey: "wallpaper.auto" },
] as const;

interface Props extends SettingsSectionProps {
  backgrounds: readonly BackgroundOption[];
  config: LauncherConfig;
  webGL?: boolean;
}

const getInitialCategory = (settings: SettingsSectionProps["settings"], selected?: BackgroundOption) => {
  if (settings.weatherPhoto) {
    return "photo";
  }
  if (selected?.anim) {
    return "animated";
  }
  return selected?.category === "solid" ? "solid" : "gradient";
};

export const BackgroundSettings = ({ settings, actions, config, backgrounds: list, webGL }: Props) => {
  const { t } = useTranslation();
  const selected = list.find((background) => background.id === settings.background);
  const unavailable = webGL === false && selected?.requiresWebGL === true;
  const animated = Boolean(selected?.anim) && !unavailable;
  const { view, drawer, navigation, services } = useSettingsEnvironment();
  const { category, expanded } = useStore(drawer);
  useLayoutEffect(() => {
    if (category === "wallpaper" && expanded) {
      services.backgroundWebGL.check();
    }
  }, [category, expanded, services.backgroundWebGL]);
  useLayoutEffect(() => {
    navigation.invalidate();
  }, [navigation, webGL]);
  const { adjusting } = useStore(view);
  const [filter, setFilter] = useState(() => getInitialCategory(settings, selected));
  const show = (category: string) => filter === category;
  // OK toggles adjusting, so Left/Right can still reach Preview from the slider.
  const toggleAdjusting = () =>
    flushSync(() => view.set({ ...view.getSnapshot(), adjusting: !view.getSnapshot().adjusting }));

  const swatches = (isAnimated: boolean) => {
    return list
      .filter((background) => Boolean(background.anim) === isAnimated && (!background.requiresWebGL || webGL !== false))
      .map((background) => {
        const solid = background.id === "custom";
        const gradient = background.id === "custom-gradient";
        const editable = solid || gradient;
        let preview = background.preview;
        if (solid) {
          preview = normalizeColour(settings.customColour);
        } else if (gradient) {
          preview = gradientBackground(settings.customGradient);
        }
        const onSelect = () => {
          if (solid) {
            actions.openColourPicker();
          } else if (gradient) {
            actions.openGradientPicker();
          } else {
            actions.setBackground(background.id);
          }
        };
        return (
          <WallpaperSwatch
            key={background.id}
            editable={editable}
            background={editable ? { ...background, preview } : background}
            labelKey={editable ? "wallpaper.custom" : undefined}
            hidden={
              !isAnimated && (filter === "solid" ? background.category !== "solid" : background.category === "solid")
            }
            selected={background.id === settings.background}
            onSelect={onSelect}
          />
        );
      });
  };

  return (
    <>
      <SettingsSection title={t("wallpaper.type")}>
        <ChoiceGroup
          id="wallpaper-categories"
          label={t("wallpaper.type")}
          value={filter}
          options={WALLPAPER_CATEGORY_OPTIONS}
          onSelect={(category) => {
            flushSync(() => setFilter(category));
            navigation.invalidate();
          }}
        />
      </SettingsSection>
      <SettingsSection title={t("wallpaper.dynamic")} description={t("wallpaper.photoHint")} hidden={!show("photo")}>
        <ChoiceGroup
          id="weather-photo-choice"
          value={settings.weatherPhoto}
          label={t("wallpaper.dynamic")}
          options={WEATHER_PHOTO_OPTIONS}
          onSelect={actions.setWeatherPhoto}
        />
      </SettingsSection>
      <SettingsSection title={t("wallpaper.animated")} hidden={!show("animated")}>
        {unavailable && <SettingsHint>{t("wallpaper.unavailable")}</SettingsHint>}
        <div id="bg-anim" class={styles.swatches}>
          {swatches(true)}
        </div>
        <div id="speed-row" class={styles.speedRow} hidden={!animated}>
          {animated ? (
            <>
              <SpeedSlider
                value={settings.speed}
                min={config.SPEED.MIN}
                max={config.SPEED.MAX}
                adjusting={adjusting}
                onSelect={toggleAdjusting}
              />
              <ChoiceOption id="preview" onSelect={actions.preview} inline>
                <Icon icon={Play} />
                {t("wallpaper.preview")}
              </ChoiceOption>
            </>
          ) : null}
        </div>
      </SettingsSection>
      <SettingsSection title={t("wallpaper.still")} hidden={filter !== "solid" && filter !== "gradient"}>
        <div id="bg-still" class={styles.swatches}>
          {swatches(false)}
        </div>
      </SettingsSection>
    </>
  );
};
