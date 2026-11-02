import type { WeatherSnapshot } from "../../contracts/status";
import { useStore } from "../../shared/hooks/useStore";
import type { Store } from "../../shared/state/createStore";

export const useWeather = (store: Store<WeatherSnapshot>, translate: (value: string) => string) => {
  const reading = useStore(store);
  const code = reading.code;
  const condition =
    code === 0
      ? "Clear"
      : code === 1
        ? "Mainly clear"
        : code === 2
          ? "Partly cloudy"
          : code === 3
            ? "Cloudy"
            : code === 45 || code === 48
              ? "Fog"
              : code !== null && code >= 51 && code <= 57
                ? "Drizzle"
                : code !== null && code >= 61 && code <= 67
                  ? "Rain"
                  : code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)
                    ? "Snow"
                    : code !== null && code >= 80 && code <= 82
                      ? "Showers"
                      : code !== null && code >= 95
                        ? "Thunderstorm"
                        : "Weather unavailable";
  return {
    ...reading,
    condition: translate(condition),
    text: reading.visible && reading.temperature !== null ? Math.round(reading.temperature) + "°" : "--°",
  };
};
