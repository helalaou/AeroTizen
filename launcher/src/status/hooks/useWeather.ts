import type { WeatherSnapshot } from "../../contracts/status";
import { useStore } from "../../shared/hooks/useStore";
import type { Store } from "../../shared/state/createStore";
import { getWeatherPresentation } from "../presentation/weather";

export const useWeather = (store: Store<WeatherSnapshot>, translate: (value: string) => string) => {
  const reading = useStore(store);
  const { condition } = getWeatherPresentation(reading.code);
  return {
    ...reading,
    condition: translate(condition),
    text: reading.visible && reading.temperature !== null ? Math.round(reading.temperature) + "°" : "--°",
  };
};
