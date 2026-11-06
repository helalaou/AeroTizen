import type { ClockLayout } from "../../contracts/status";
import type { useWeather } from "../hooks/useWeather";
import { WeatherIcon } from "../WeatherIcon";

import styles from "./WeatherStatus.module.css";

export const WeatherStatus = ({
  layout,
  only,
  weather,
  showWeather,
  showLocation,
}: {
  layout: ClockLayout;
  only: boolean;
  weather: ReturnType<typeof useWeather>;
  showWeather: boolean;
  showLocation: boolean;
}) =>
  layout === "compact" ? (
    <span
      id="weather"
      class={styles.compact}
      data-weather-part="compact"
      data-weather-only={only ? "true" : undefined}
      hidden={!weather.visible}
    >
      {weather.visible ? (
        <>
          <WeatherIcon code={weather.code} />
          <b class={styles.compactTemperature}>{weather.text}</b>
          {weather.showLocation ? <span class={styles.compactLocation}>{weather.city}</span> : null}
        </>
      ) : null}
    </span>
  ) : (
    <>
      <div class={styles.expanded} data-weather-part="expanded" data-clock-layout={layout} hidden={!showWeather}>
        <span class={styles.icon} data-weather-part="icon">
          {weather.visible ? <WeatherIcon code={weather.code} /> : null}
        </span>
        <span class={styles.temperature} data-weather-part="temperature">
          {weather.text}
        </span>
        <span class={styles.condition} data-weather-part="condition">
          {weather.condition}
        </span>
      </div>
      <div
        class={styles.location}
        data-weather-part="location"
        data-clock-layout={layout}
        hidden={!showWeather || !showLocation || !weather.visible}
      >
        {weather.city}
      </div>
    </>
  );
