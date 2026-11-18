import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { InputScopeContext } from "../../../../shared/input/context";
import { ChoiceGroup } from "../../../components/ChoiceGroup";
import { ChoiceOption } from "../../../components/ChoiceOption/ChoiceOption";
import { SettingsField } from "../../../components/SettingsField/SettingsField";
import { SettingsHint } from "../../../components/SettingsHint/SettingsHint";
import { SettingsTextInput } from "../../../components/SettingsTextInput/SettingsTextInput";
import { SettingsToggle } from "../../../components/SettingsToggle/SettingsToggle";
import type { SettingsSectionProps } from "../../../types";
import { useWeatherLocation } from "../useWeatherLocation";

import styles from "./WeatherSettings.module.css";

const LOCATION_QUERY_MAX_LENGTH = 80;

const TEMPERATURE_UNIT_OPTIONS = [
  { value: "C", labelKey: "weather.celsius" },
  { value: "F", labelKey: "weather.fahrenheit" },
] as const;

interface Props extends SettingsSectionProps {
  active: boolean;
}

export const WeatherSettings = ({ settings, actions, active }: Props) => {
  const { t } = useTranslation();
  const search = useWeatherLocation(active && settings.showWeather, actions);
  let location = t("common.automatic");
  if (settings.weatherLocation) {
    location = t("weather.manualLocation", {
      location: settings.weatherLocation.label || settings.weatherLocation.name,
    });
  } else if (search.city) {
    location = t("weather.automaticLocation", { location: search.city });
  }
  return (
    <InputScopeContext.Provider value={search.inputScope}>
      <SettingsField title={t("weather.show")}>
        <SettingsToggle
          focusKey="weather-display"
          label={t("weather.show")}
          checked={settings.showWeather}
          onChange={actions.setWeatherVisible}
        />
      </SettingsField>
      <SettingsField title={t("weather.showLocationName")} hidden={!settings.showWeather}>
        <SettingsToggle
          focusKey="weather-visibility"
          label={t("weather.showLocationName")}
          checked={settings.weatherShowLocation}
          onChange={actions.setLocationVisible}
        />
      </SettingsField>
      <SettingsField title={t("weather.unit")} hidden={!settings.showWeather}>
        <ChoiceGroup
          id="units"
          label={t("weather.unit")}
          value={settings.tempUnit}
          options={TEMPERATURE_UNIT_OPTIONS}
          onSelect={actions.setTempUnit}
        />
      </SettingsField>
      <SettingsField
        title={t("weather.locationLabel")}
        description={
          <span data-weather-location-summary aria-live="polite">
            {location}
          </span>
        }
        hidden={!settings.showWeather}
        detailsHidden={!search.editing}
        fullWidthDetails
        details={
          <div id="weather-location-editor" class={styles.editor} hidden={!search.editing}>
            <SettingsHint>{t("weather.searchHelp")}</SettingsHint>
            <div id="weather-location" class={styles.searchControls}>
              <SettingsTextInput
                focusKey="weather:query"
                active={search.enabled && search.editing}
                autoFocus={search.editing}
                name="weather-location"
                label={t("weather.locationLabel")}
                placeholder={t("weather.searchPlaceholder")}
                enterKeyHint="search"
                maxLength={LOCATION_QUERY_MAX_LENGTH}
                value={search.query}
                onValueChange={search.setQuery}
                onSubmit={search.submitQuery}
              />
              <ChoiceOption id="weather:search" onSelect={search.search} busy={search.busy} disabled={search.busy}>
                {t(search.busy ? "weather.searching" : "weather.search")}
              </ChoiceOption>
            </div>
            <SettingsHint class={styles.searchStatus} id="weather-search-status" role="status" hidden={!search.message}>
              {search.message && t(search.message)}
            </SettingsHint>
            <div id="weather-results" class={styles.results} hidden={!search.results.length}>
              {search.results.map((location, index) => (
                <ChoiceOption
                  key={location.label + ":" + index}
                  id={"weather:result:" + index}
                  align="start"
                  truncate
                  onSelect={() => search.selectLocation(location)}
                >
                  {location.label}
                </ChoiceOption>
              ))}
            </div>
            <div class={styles.automatic}>
              <ChoiceOption
                id="weather:auto"
                selected={!settings.weatherLocation}
                onSelect={() => search.selectLocation(null)}
              >
                {t("weather.useAutomatic")}
              </ChoiceOption>
              <p class={styles.hint}>{t("weather.automaticHint")}</p>
            </div>
          </div>
        }
      >
        <div class={styles.change}>
          <ChoiceOption
            fill
            id="weather:change"
            onSelect={search.toggleEditing}
            controls="weather-location-editor"
            expanded={search.editing}
          >
            {t(search.editing ? "common.cancel" : "weather.changeLocation")}
          </ChoiceOption>
        </div>
      </SettingsField>
    </InputScopeContext.Provider>
  );
};
