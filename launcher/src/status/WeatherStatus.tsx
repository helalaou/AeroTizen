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
    <span id="weather" class="weather" hidden={!weather.visible}>
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
      <div class="aero-v991-weather" hidden={!showWeather}>
        <span class="aero-v991-weather-icon">{weather.visible ? <WeatherIcon code={weather.code} /> : null}</span>
        <span id="aero-v991-temp" class="aero-v991-temp">
          {weather.text}
        </span>
        <span id="aero-v991-condition" class="aero-v991-condition">
          {weather.condition}
        </span>
      </div>
      <div id="aero-v991-city" class="aero-v991-city" hidden={!showWeather || !showLocation || !weather.visible}>
        {weather.city}
      </div>
    </>
  );
