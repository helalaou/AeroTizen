import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { ChoiceOption } from "../../components/ChoiceOption";
import { SettingsControl } from "../../components/SettingsControl";
import { SettingsSection } from "../../components/SettingsSection";
import type { SettingsSectionProps } from "../../types";

import { useWeatherLocation } from "./useWeatherLocation";

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
        <div id="weather-location" class="weather-location-controls">
          <ChoiceOption
            id="weather:auto"
            selected={!settings.weatherLocation}
            onSelect={() => search.selectLocation(null)}
          >
            {t("common.automatic")}
          </ChoiceOption>
          <SettingsControl class="weather-search" focusKey="weather:query" onClick={search.focusQuery}>
            <input
              ref={search.inputRef}
              type="text"
              maxLength={80}
              value={search.query}
              placeholder={t("weather.searchPlaceholder")}
              aria-label={t("weather.locationLabel")}
              onInput={search.onQueryInput}
            />
          </SettingsControl>
          <ChoiceOption id="weather:search" onSelect={search.search}>
            {t("weather.search")}
          </ChoiceOption>
        </div>
        <p id="weather-search-status" class="hint" role="status" hidden={!search.message}>
          {search.message && t(search.message)}
        </p>
        <div id="weather-results" class="weather-results" hidden={!search.results.length}>
          {search.results.map((location, index) => (
            <ChoiceOption
              key={location.label + ":" + index}
              id={"weather:result:" + index}
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
