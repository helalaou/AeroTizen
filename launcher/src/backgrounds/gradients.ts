import type { CustomGradient } from "../contracts/preferences";

import { normalizeColour } from "./colours";

export const DEFAULT_CUSTOM_GRADIENT: CustomGradient = {
  start: "#7c5cff",
  end: "#00c4d4",
  angle: 135,
};

export const normalizeGradient = (value: unknown, fallback = DEFAULT_CUSTOM_GRADIENT): CustomGradient => {
  const source = value && typeof value === "object" ? (value as Partial<CustomGradient>) : {};
  const angle =
    typeof source.angle === "number" && Number.isFinite(source.angle)
      ? ((Math.round(source.angle) % 360) + 360) % 360
      : fallback.angle;
  return {
    start: normalizeColour(source.start, fallback.start),
    end: normalizeColour(source.end, fallback.end),
    angle,
  };
};

export const gradientBackground = (value: unknown): string => {
  const { start, end, angle } = normalizeGradient(value);
  return `linear-gradient(${angle}deg, ${start}, ${end})`;
};

export const gradientMidpoint = (value: CustomGradient): string => {
  const { start, end } = normalizeGradient(value);
  const channels = [1, 3, 5].map((offset) =>
    Math.round((parseInt(start.slice(offset, offset + 2), 16) + parseInt(end.slice(offset, offset + 2), 16)) / 2)
      .toString(16)
      .padStart(2, "0"),
  );
  return "#" + channels.join("");
};
