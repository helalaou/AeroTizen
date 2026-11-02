export type WeatherSymbol = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
interface WeatherPresentation {
  readonly condition: string;
  readonly symbol: WeatherSymbol;
}

const CONDITIONS: Readonly<Partial<Record<number, WeatherPresentation>>> = {
  0: { symbol: "sun", condition: "Clear" },
  1: { symbol: "sun", condition: "Mainly clear" },
  2: { symbol: "partly", condition: "Partly cloudy" },
  3: { symbol: "cloud", condition: "Cloudy" },
  45: { symbol: "fog", condition: "Fog" },
  48: { symbol: "fog", condition: "Fog" },
  85: { symbol: "snow", condition: "Snow" },
  86: { symbol: "snow", condition: "Snow" },
};
const CONDITION_RANGES = [
  { min: 51, max: 57, presentation: { symbol: "rain", condition: "Drizzle" } },
  { min: 61, max: 67, presentation: { symbol: "rain", condition: "Rain" } },
  { min: 71, max: 77, presentation: { symbol: "snow", condition: "Snow" } },
  { min: 80, max: 82, presentation: { symbol: "rain", condition: "Showers" } },
  { min: 95, max: Infinity, presentation: { symbol: "storm", condition: "Thunderstorm" } },
] as const;
const UNAVAILABLE: WeatherPresentation = { symbol: "cloud", condition: "Weather unavailable" };
const UNAVAILABLE_RAIN: WeatherPresentation = { symbol: "rain", condition: "Weather unavailable" };

export const getWeatherPresentation = (code: number | null): WeatherPresentation => {
  if (code === null) {
    return UNAVAILABLE;
  }
  const known = CONDITIONS[code];
  if (known) {
    return known;
  }
  const range = CONDITION_RANGES.find(({ min, max }) => code >= min && code <= max);
  if (range) {
    return range.presentation;
  }
  return code >= 51 ? UNAVAILABLE_RAIN : UNAVAILABLE;
};
