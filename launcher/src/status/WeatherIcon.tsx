import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-preact";

import { Icon } from "../shared/icons/Icon";

export const WeatherIcon = ({ code }: { code: number | null }) => {
  const glyph =
    code === 0 || code === 1
      ? Sun
      : code === 2
        ? CloudSun
        : code === 45 || code === 48
          ? CloudFog
          : code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)
            ? CloudSnow
            : code !== null && code >= 95
              ? CloudLightning
              : code !== null && code >= 51
                ? CloudRain
                : Cloud;
  const color =
    glyph === Sun || glyph === CloudSun || glyph === CloudLightning
      ? "#ffd34d"
      : glyph === CloudRain
        ? "#6cb6ff"
        : glyph === CloudSnow
          ? "#fff"
          : "#d5dbe4";
  return <Icon icon={glyph} color={color} />;
};
