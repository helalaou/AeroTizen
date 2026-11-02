import type { useWeather } from "./hooks/useWeather";
import { WeatherIcon } from "./WeatherIcon";

export const WeatherStatus = ({
  variant,
  weather,
  showWeather,
  showLocation,
}: {
  variant: "compact" | "expanded";
  weather: ReturnType<typeof useWeather>;
  showWeather: boolean;
  showLocation: boolean;
}) =>
  variant === "compact" ? (
    <span id="weather" class="weather weather-status--compact" hidden={!weather.visible}>
      {weather.visible ? (
        <>
          <WeatherIcon code={weather.code} />
          <b>{weather.text}</b>
          {weather.showLocation ? <span>{weather.city}</span> : null}
        </>
      ) : null}
    </span>
  ) : (
    <>
      <div class="weather-status--expanded" hidden={!showWeather}>
        <span class="weather-status__icon">{weather.visible ? <WeatherIcon code={weather.code} /> : null}</span>
        <span class="weather-status__temperature">{weather.text}</span>
        <span class="weather-status__condition">{weather.condition}</span>
      </div>
      <div class="weather-status__location" hidden={!showWeather || !showLocation || !weather.visible}>
        {weather.city}
      </div>
    </>
  );
