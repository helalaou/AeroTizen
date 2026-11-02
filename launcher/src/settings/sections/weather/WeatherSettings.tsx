import { ChoiceGroup } from "../../components/ChoiceGroup";
import { ChoiceOption } from "../../components/ChoiceOption";
import { SettingsControl } from "../../components/SettingsControl";
import type { SettingsSectionProps } from "../../types";

import { useWeatherLocation } from "./useWeatherLocation";

const WEATHER_VISIBILITY_OPTIONS = [
  { value: true, label: "Show weather" },
  { value: false, label: "Hide weather" },
] as const;

const LOCATION_VISIBILITY_OPTIONS = [
  { value: true, label: "Show location" },
  { value: false, label: "Hide location" },
] as const;

const TEMPERATURE_UNIT_OPTIONS = [
  { value: "F", label: "°F  Fahrenheit" },
  { value: "C", label: "°C  Celsius" },
] as const;

interface Props extends SettingsSectionProps {
  active: boolean;
}

export const WeatherSettings = ({ settings, actions, active }: Props) => {
  const search = useWeatherLocation(active, actions);
  return (
    <>
      <h3>Weather</h3>
      <ChoiceGroup
        id="weather-display"
        label="Weather visibility"
        value={settings.showWeather !== false}
        options={WEATHER_VISIBILITY_OPTIONS}
        onSelect={actions.setWeatherVisible}
      />
      <p id="weather-location-summary" class="hint">
        {settings.weatherLocation
          ? "Location: " + (settings.weatherLocation.label || settings.weatherLocation.name)
          : "Automatic location uses your internet address and can be inaccurate. Search for your town, city or postcode to set it."}
      </p>
      <div id="weather-location" class="units">
        <ChoiceOption
          id="weather:auto"
          selected={!settings.weatherLocation}
          onSelect={() => search.selectLocation(null)}
        >
          Automatic
        </ChoiceOption>
        <SettingsControl
          class="pill unit name-pill weather-search"
          focusKey="weather:query"
          onClick={search.focusQuery}
        >
          <input
            ref={search.inputRef}
            type="text"
            maxLength={80}
            value={search.query}
            placeholder="Town, city or postcode"
            aria-label="Weather location"
            onInput={search.onQueryInput}
          />
        </SettingsControl>
        <ChoiceOption id="weather:search" onSelect={search.search}>
          Search
        </ChoiceOption>
      </div>
      <p id="weather-search-status" class="hint" role="status" hidden={!search.message}>
        {search.message}
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
        label="Weather location visibility"
        value={settings.weatherShowLocation}
        options={LOCATION_VISIBILITY_OPTIONS}
        onSelect={actions.setLocationVisible}
      />
      <h3>Temperature</h3>
      <ChoiceGroup
        id="units"
        label="Temperature unit"
        value={settings.tempUnit}
        options={TEMPERATURE_UNIT_OPTIONS}
        onSelect={actions.setTempUnit}
      />
    </>
  );
};
