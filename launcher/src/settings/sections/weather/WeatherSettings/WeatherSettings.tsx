import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { InputScopeContext } from "../../../../shared/input/context";
import { ChoiceGroup } from "../../../components/ChoiceGroup";
import { ChoiceOption } from "../../../components/ChoiceOption/ChoiceOption";
import { SettingsHint } from "../../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../../components/SettingsSection/SettingsSection";
import { SettingsTextInput } from "../../../components/SettingsTextInput/SettingsTextInput";
import type { SettingsSectionProps } from "../../../types";
import { useWeatherLocation } from "../useWeatherLocation";

import styles from "./WeatherSettings.module.css";

const LOCATION_QUERY_MAX_LENGTH = 80;

const VISIBILITY_OPTIONS = [
  { value: true, labelKey: "common.on" },
  { value: false, labelKey: "common.off" },
] as const;

const TEMPERATURE_UNIT_OPTIONS = [
  { value: "C", labelKey: "weather.celsius" },
  { value: "F", labelKey: "weather.fahrenheit" },
] as const;

interface Props extends SettingsSectionProps {
  active: boolean;
}

export const WeatherSettings = ({ settings, actions, active }: Props) => {
  const { t } = useTranslation();
  const search = useWeatherLocation(active, actions);
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
      <SettingsSection title={t("weather.homeDisplay")} hidden={search.editing}>
        <div class={styles.displayRow}>
          <span class={styles.label}>{t("weather.show")}</span>
          <ChoiceGroup
            id="weather-display"
            label={t("weather.visibility")}
            value={settings.showWeather}
            options={VISIBILITY_OPTIONS}
            onSelect={actions.setWeatherVisible}
          />
        </div>
        <div class={styles.displayRow}>
          <span class={styles.label}>{t("weather.showLocationName")}</span>
          <ChoiceGroup
            id="weather-visibility"
            label={t("weather.locationVisibility")}
            value={settings.weatherShowLocation}
            options={VISIBILITY_OPTIONS}
            onSelect={actions.setLocationVisible}
          />
        </div>
        <div class={styles.displayRow}>
          <span class={styles.label}>{t("weather.unit")}</span>
          <ChoiceGroup
            id="units"
            label={t("weather.unit")}
            value={settings.tempUnit}
            options={TEMPERATURE_UNIT_OPTIONS}
            onSelect={actions.setTempUnit}
          />
        </div>
      </SettingsSection>
      <SettingsSection title={t("weather.locationLabel")} description={t("weather.sharedLocationHint")}>
        <div class={styles.locationSummary}>
          <p class={styles.location} data-weather-location-summary aria-live="polite">
            {location}
          </p>
          <ChoiceOption
            id="weather:change"
            onSelect={search.toggleEditing}
            controls="weather-location-editor"
            expanded={search.editing}
          >
            {t(search.editing ? "common.cancel" : "weather.changeLocation")}
          </ChoiceOption>
        </div>
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
      </SettingsSection>
    </InputScopeContext.Provider>
  );
};
