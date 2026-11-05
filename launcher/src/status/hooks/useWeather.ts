import type { WeatherSnapshot } from "../../contracts/status";
import { useStore } from "../../shared/hooks/useStore";
import { useTranslation } from "../../shared/i18n/useTranslation";
import type { Store } from "../../shared/state/createStore";
import { getWeatherPresentation } from "../../shared/weather/conditions";

export const useWeather = (store: Store<WeatherSnapshot>) => {
  const { t } = useTranslation();
  const reading = useStore(store);
  const { condition } = getWeatherPresentation(reading.code);
  return {
    ...reading,
    condition: t(condition),
    text: reading.visible && reading.temperature !== null ? Math.round(reading.temperature) + "°" : "--°",
  };
};
