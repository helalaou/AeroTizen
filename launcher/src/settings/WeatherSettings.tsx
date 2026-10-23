import { useLayoutEffect, useRef } from 'preact/hooks';
import { Choice } from './Choice';
import { Pill } from './Pill';
import { useWeatherSearch } from './hooks/useWeatherSearch';
import { useSettingsEnvironment } from './hooks/useSettingsEnvironment';
import type { SettingsSectionProps, WeatherLocation } from './types';

interface Props extends SettingsSectionProps { active: boolean }

export const WeatherSettings = ({ settings, actions, active }: Props) => {
  const { services, navigation, view } = useSettingsEnvironment();
  const search = useWeatherSearch(services.searchLocations, active);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    navigation.invalidate();
    if (active && !view.getSnapshot().previewing) { navigation.focus(); }
  }, [search.results, search.message, active, navigation, view]);
  const selectLocation = (location: WeatherLocation | null) => {
    search.clear(); navigation.select(location ? 'weather:query' : 'weather:auto'); actions.setLocation(location);
  };
  return (
    <>
      <h3>Weather</h3>
      <Choice id="weather-display" label="Weather visibility" value={settings.showWeather !== false}
        options={[[true, 'Show weather'], [false, 'Hide weather']]} onSelect={actions.setWeatherVisible} />
      <p id="weather-location-summary" class="hint">
        {settings.weatherLocation ? 'Location: ' + (settings.weatherLocation.label || settings.weatherLocation.name) :
          'Automatic location uses your internet address and can be inaccurate. Search for your town, city or postcode to set it.'}
      </p>
      <div id="weather-location" class="units">
        <Pill id="weather:auto" selected={!settings.weatherLocation} onSelect={() => selectLocation(null)}>Automatic</Pill>
        <div class="pill unit name-pill weather-search" data-key="weather:query" onClick={() => input.current?.focus()}>
          <input ref={input} type="text" maxLength={80} value={search.query} placeholder="Town, city or postcode"
            aria-label="Weather location" onInput={event => search.setQuery(event.currentTarget.value)} />
        </div>
        <Pill id="weather:search" onSelect={search.search}>Search</Pill>
      </div>
      <p id="weather-search-status" class="hint" role="status" hidden={!search.message}>{search.message}</p>
      <div id="weather-results" class="weather-results" hidden={!search.results.length}>
        {search.results.map((location, index) => (
          <Pill key={location.label + ':' + index} id={'weather:result:' + index}
            onSelect={() => selectLocation(location)}>{location.label}</Pill>
        ))}
      </div>
      <Choice id="weather-visibility" label="Weather location visibility" value={settings.weatherShowLocation}
        options={[[true, 'Show location'], [false, 'Hide location']]} onSelect={actions.setLocationVisible} />
      <h3>Temperature</h3>
      <Choice id="units" label="Temperature unit" value={settings.tempUnit}
        options={[['F', '°F  Fahrenheit'], ['C', '°C  Celsius']]} onSelect={actions.setTempUnit} />
    </>
  );
};
