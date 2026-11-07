import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../../../components/ChoiceGroup";
import { ChoiceOption } from "../../../components/ChoiceOption/ChoiceOption";
import { SettingsHint } from "../../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../../components/SettingsSection/SettingsSection";
import type { SettingsSectionProps } from "../../../types";
import { useWeatherLocation } from "../useWeatherLocation";
import { WeatherSearch } from "../WeatherSearch/WeatherSearch";

import styles from "./WeatherSettings.module.css";

const WEATHER_VISIBILITY_OPTIONS = [
  { value: true, labelKey: "weather.show" },
  { value: false, labelKey: "weather.hide" },
] as const;

const LOCATION_VISIBILITY_OPTIONS = [
  { value: true, labelKey: "weather.showLocation" },
  { value: false, labelKey: "weather.hideLocation" },
] as const;

const TEMPERATURE_UNIT_OPTIONS = [
  { value: "F", labelKey: "weather.fahrenheit" },
  { value: "C", labelKey: "weather.celsius" },
] as const;

interface Props extends SettingsSectionProps {
  active: boolean;
}

export const WeatherSettings = ({ settings, actions, active }: Props) => {
  const { t } = useTranslation();
  const search = useWeatherLocation(active, actions);
  return (
    <>
      <SettingsSection title={t("weather.visibility")}>
        <ChoiceGroup
          id="weather-display"
          label={t("weather.visibility")}
          value={settings.showWeather !== false}
          options={WEATHER_VISIBILITY_OPTIONS}
          onSelect={actions.setWeatherVisible}
        />
      </SettingsSection>
      <SettingsSection
        title={t("weather.locationLabel")}
        description={
          settings.weatherLocation
            ? t("weather.location", { location: settings.weatherLocation.label || settings.weatherLocation.name })
            : t("weather.autoLocation")
        }
      >
        <div id="weather-location" class={styles.locationControls}>
          <ChoiceOption
            id="weather:auto"
            selected={!settings.weatherLocation}
            onSelect={() => search.selectLocation(null)}
          >
            {t("common.automatic")}
          </ChoiceOption>
          <WeatherSearch
            inputRef={search.inputRef}
            value={search.query}
            onSelect={search.focusQuery}
            onInput={search.onQueryInput}
          />
          <ChoiceOption id="weather:search" onSelect={search.search}>
            {t("weather.search")}
          </ChoiceOption>
        </div>
        <SettingsHint id="weather-search-status" role="status" hidden={!search.message}>
          {search.message && t(search.message)}
        </SettingsHint>
        <div id="weather-results" class={styles.results} hidden={!search.results.length}>
          {search.results.map((location, index) => (
            <ChoiceOption
              key={location.label + ":" + index}
              id={"weather:result:" + index}
              truncate
              onSelect={() => search.selectLocation(location)}
            >
              {location.label}
            </ChoiceOption>
          ))}
        </div>
        <ChoiceGroup
          id="weather-visibility"
          label={t("weather.locationVisibility")}
          value={settings.weatherShowLocation}
          options={LOCATION_VISIBILITY_OPTIONS}
          onSelect={actions.setLocationVisible}
        />
      </SettingsSection>
      <SettingsSection title={t("weather.temperature")}>
        <ChoiceGroup
          id="units"
          label={t("weather.unit")}
          value={settings.tempUnit}
          options={TEMPERATURE_UNIT_OPTIONS}
          onSelect={actions.setTempUnit}
        />
      </SettingsSection>
    </>
  );
};
