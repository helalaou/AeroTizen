import { ChevronLeft, ChevronRight, Play } from "lucide-preact";
import { flushSync } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";

import type { BackgroundOption, LauncherConfig } from "../../contracts/launcher";
import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { Icon } from "../../shared/icons/Icon";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption";
import { SelectionIndicator } from "../components/SelectionIndicator";
import { SettingsControl } from "../components/SettingsControl";
import { SettingsSection } from "../components/SettingsSection";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";
import type { SettingsSectionProps } from "../types";

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

const getInitialCategory = (settings: SettingsSectionProps["settings"], animated: boolean) => {
  if (settings.weatherPhoto) {
    return "photo";
  }
  if (animated) {
    return "animated";
  }
  return settings.background === "black" ? "solid" : "gradient";
};

export const BackgroundSettings = ({ settings, actions, config, backgrounds: list, webGL }: Props) => {
  const { t } = useTranslation();
  const selected = list.find((background) => background.id === settings.background);
  const unavailable = webGL === false && selected?.requiresWebGL === true;
  const animated = Boolean(selected?.anim) && !unavailable;
  const percent = ((settings.speed - config.SPEED.MIN) / (config.SPEED.MAX - config.SPEED.MIN)) * 100;
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
  const [filter, setFilter] = useState(() => getInitialCategory(settings, Boolean(selected?.anim)));
  const show = (category: string) => filter === category;
  // OK toggles adjusting, so Left/Right can still reach Preview from the slider.
  const toggleAdjusting = () =>
    flushSync(() => view.set({ ...view.getSnapshot(), adjusting: !view.getSnapshot().adjusting }));

  const swatches = (isAnimated: boolean) => {
    return list
      .filter((background) => Boolean(background.anim) === isAnimated && (!background.requiresWebGL || webGL !== false))
      .map((background) => (
        <SettingsControl
          key={background.id}
          class={"swatch" + (background.id === settings.background ? " on" : "")}
          hidden={!isAnimated && (filter === "solid" ? background.id !== "black" : background.id === "black")}
          focusKey={"bg:" + background.id}
          role="button"
          aria-pressed={background.id === settings.background}
          style={{ background: background.preview }}
          onClick={() => actions.setBackground(background.id)}
        >
          <span>{t(`scene.${background.id}`)}</span>
          {background.id === settings.background ? <SelectionIndicator /> : null}
        </SettingsControl>
      ));
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
        {unavailable && <p class="hint">{t("wallpaper.unavailable")}</p>}
        <div id="bg-anim" class="swatches">
          {swatches(true)}
        </div>
        <div id="speed-row" class="speed-row" hidden={!animated}>
          {animated ? (
            <>
              <SettingsControl
                class={"slider" + (adjusting ? " adjusting" : "")}
                focusKey="speed"
                role="slider"
                aria-label={t("wallpaper.speedLabel")}
                aria-valuemin={config.SPEED.MIN}
                aria-valuemax={config.SPEED.MAX}
                aria-valuenow={settings.speed}
                onClick={toggleAdjusting}
              >
                <span class="slider-label">{t("wallpaper.speed")}</span>
                <div class="track">
                  <div class="fill" style={{ width: percent + "%" }} />
                  <div class="thumb" style={{ left: percent + "%" }} />
                </div>
                <span class="slider-value">{settings.speed}×</span>
                <span class="slider-hint">
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
              <ChoiceOption id="preview" onSelect={actions.preview}>
                <Icon icon={Play} />
                {t("wallpaper.preview")}
              </ChoiceOption>
            </>
          ) : null}
        </div>
      </SettingsSection>
      <SettingsSection title={t("wallpaper.still")} hidden={filter !== "solid" && filter !== "gradient"}>
        <div id="bg-still" class="swatches">
          {swatches(false)}
        </div>
      </SettingsSection>
    </>
  );
};
