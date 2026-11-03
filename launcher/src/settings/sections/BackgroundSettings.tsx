import { flushSync } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";

import type { BackgroundOption, LauncherConfig } from "../../contracts/launcher";
import { useStore } from "../../shared/hooks/useStore";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption";
import { SelectionIndicator } from "../components/SelectionIndicator";
import { SettingsControl } from "../components/SettingsControl";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";
import type { SettingsSectionProps } from "../types";

const WALLPAPER_CATEGORY_OPTIONS = [
  { value: "photo", label: "Weather photos" },
  { value: "solid", label: "Solid colour" },
  { value: "gradient", label: "Gradients" },
  { value: "animated", label: "Animated backgrounds" },
] as const;

const WEATHER_PHOTO_OPTIONS = [
  { value: false, label: "Off" },
  { value: true, label: "Automatic (weather)" },
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
          <span>{background.name}</span>
          {background.id === settings.background ? <SelectionIndicator /> : null}
        </SettingsControl>
      ));
  };

  return (
    <>
      <ChoiceGroup
        id="wallpaper-categories"
        label="Background type"
        value={filter}
        options={WALLPAPER_CATEGORY_OPTIONS}
        onSelect={(category) => {
          flushSync(() => setFilter(category));
          navigation.invalidate();
        }}
      />
      <div hidden={!show("photo")}>
        <h3>Dynamic weather wallpapers</h3>
        <ChoiceGroup
          id="weather-photo-choice"
          value={settings.weatherPhoto}
          label="Dynamic weather wallpapers"
          options={WEATHER_PHOTO_OPTIONS}
          onSelect={actions.setWeatherPhoto}
        />
        <p class="hint">
          Nine AI-generated scenes follow the weather and time of day. Off restores your selected background.
        </p>
      </div>
      <div hidden={!show("animated")}>
        <h3>Animated backgrounds</h3>
        {unavailable && <p class="hint">Your saved wallpaper is shown without animation on this device.</p>}
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
                aria-label="Background speed"
                aria-valuemin={config.SPEED.MIN}
                aria-valuemax={config.SPEED.MAX}
                aria-valuenow={settings.speed}
                onClick={toggleAdjusting}
              >
                <span class="slider-label">Speed</span>
                <div class="track">
                  <div class="fill" style={{ width: percent + "%" }} />
                  <div class="thumb" style={{ left: percent + "%" }} />
                </div>
                <span class="slider-value">{settings.speed}×</span>
                <span class="slider-hint">{adjusting ? "◀ ▶" : "OK to adjust"}</span>
              </SettingsControl>
              <ChoiceOption id="preview" onSelect={actions.preview}>
                {"▶  Preview"}
              </ChoiceOption>
            </>
          ) : null}
        </div>
      </div>
      <div hidden={filter !== "solid" && filter !== "gradient"}>
        <h3>Still backgrounds</h3>
        <div id="bg-still" class="swatches">
          {swatches(false)}
        </div>
      </div>
    </>
  );
};
