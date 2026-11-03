import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-preact";

import { Icon } from "../shared/icons/Icon";

import { getWeatherPresentation } from "./presentation/weather";

const WEATHER_ICONS = {
  sun: { icon: Sun, color: "#ffd34d" },
  partly: { icon: CloudSun, color: "#ffd34d" },
  cloud: { icon: Cloud, color: "#d5dbe4" },
  fog: { icon: CloudFog, color: "#d5dbe4" },
  rain: { icon: CloudRain, color: "#6cb6ff" },
  snow: { icon: CloudSnow, color: "#fff" },
  storm: { icon: CloudLightning, color: "#ffd34d" },
} as const;

export const WeatherIcon = ({ code }: { code: number | null }) => {
  const { symbol } = getWeatherPresentation(code);
  const { icon, color } = WEATHER_ICONS[symbol];
  return <Icon icon={icon} color={color} />;
};
