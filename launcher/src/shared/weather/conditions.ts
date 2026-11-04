import type { MessageKey } from "../i18n/catalogues";

export type WeatherSymbol = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
interface WeatherPresentation {
  readonly condition: MessageKey;
  readonly symbol: WeatherSymbol;
}

const THUNDERSTORM: WeatherPresentation = { symbol: "storm", condition: "weather.thunderstorm" };
const CONDITIONS: Readonly<Partial<Record<number, WeatherPresentation>>> = {
  0: { symbol: "sun", condition: "weather.clear" },
  1: { symbol: "sun", condition: "weather.mainlyClear" },
  2: { symbol: "partly", condition: "weather.partlyCloudy" },
  3: { symbol: "cloud", condition: "weather.cloudy" },
  45: { symbol: "fog", condition: "weather.fog" },
  48: { symbol: "fog", condition: "weather.fog" },
  85: { symbol: "snow", condition: "weather.snow" },
  86: { symbol: "snow", condition: "weather.snow" },
  95: THUNDERSTORM,
  96: THUNDERSTORM,
  99: THUNDERSTORM,
};
const CONDITION_RANGES = [
  { min: 51, max: 57, presentation: { symbol: "rain", condition: "weather.drizzle" } },
  { min: 61, max: 67, presentation: { symbol: "rain", condition: "weather.rain" } },
  { min: 71, max: 77, presentation: { symbol: "snow", condition: "weather.snow" } },
  { min: 80, max: 82, presentation: { symbol: "rain", condition: "weather.showers" } },
] as const;
const UNAVAILABLE: WeatherPresentation = { symbol: "cloud", condition: "weather.unavailable" };
const UNAVAILABLE_RAIN: WeatherPresentation = { symbol: "rain", condition: "weather.unavailable" };

export const lookupWeather = (code: number): WeatherPresentation | undefined => {
  const known = CONDITIONS[code];
  if (known) {
    return known;
  }
  const range = CONDITION_RANGES.find(({ min, max }) => code >= min && code <= max);
  return range && range.presentation;
};

export const getWeatherPresentation = (code: number | null): WeatherPresentation => {
  if (code === null) {
    return UNAVAILABLE;
  }
  if (code >= 95) {
    return THUNDERSTORM;
  }
  return lookupWeather(code) || (code >= 51 ? UNAVAILABLE_RAIN : UNAVAILABLE);
};
