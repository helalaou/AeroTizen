import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-preact";

import { Icon } from "../shared/icons/Icon/Icon";
import { getWeatherPresentation } from "../shared/weather/conditions";

const WEATHER_ICONS = {
  sun: { icon: Sun, color: "sun" },
  partly: { icon: CloudSun, color: "sun" },
  cloud: { icon: Cloud, color: "cloud" },
  fog: { icon: CloudFog, color: "cloud" },
  rain: { icon: CloudRain, color: "rain" },
  snow: { icon: CloudSnow, color: "snow" },
  storm: { icon: CloudLightning, color: "sun" },
} as const;

export const WeatherIcon = ({ code }: { code: number | null }) => {
  const { symbol } = getWeatherPresentation(code);
  const { icon, color } = WEATHER_ICONS[symbol];
  return <Icon icon={icon} color={`var(--weather-icon-contrast, var(--weather-icon-${color}))`} />;
};
