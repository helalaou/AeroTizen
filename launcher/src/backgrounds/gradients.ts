import type { CustomGradient } from "../contracts/preferences";

export const DEFAULT_CUSTOM_GRADIENT: CustomGradient = {
  start: "#7c5cff",
  end: "#00c4d4",
  angle: 135,
};

const gradientColour = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

export const normalizeGradient = (value: unknown): CustomGradient => {
  const source = value && typeof value === "object" ? (value as Partial<CustomGradient>) : {};
  const angle =
    typeof source.angle === "number" && Number.isFinite(source.angle)
      ? ((Math.round(source.angle) % 360) + 360) % 360
      : DEFAULT_CUSTOM_GRADIENT.angle;
  return {
    start: gradientColour(source.start, DEFAULT_CUSTOM_GRADIENT.start),
    end: gradientColour(source.end, DEFAULT_CUSTOM_GRADIENT.end),
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
