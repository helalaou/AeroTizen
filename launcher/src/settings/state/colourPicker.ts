import type { ColourChannels } from "../../backgrounds/colours";

export const COLOUR_CONTROLS = [
  { value: "hue", labelKey: "wallpaper.colour", max: 359, step: 1, unit: "°" },
  { value: "strength", labelKey: "wallpaper.strength", max: 100, step: 1, unit: "%" },
  { value: "lightness", labelKey: "wallpaper.lightness", max: 100, step: 1, unit: "%" },
] as const;

export type ColourChannel = keyof ColourChannels;

export const adjustColourChannel = (colour: ColourChannels, channel: ColourChannel, direction: number) => {
  const control = COLOUR_CONTROLS.find((control) => control.value === channel);
  if (!control) {
    return colour;
  }
  const next = Math.round(colour[channel]) + direction * control.step;
  const value = channel === "hue" ? ((next % 360) + 360) % 360 : Math.max(0, Math.min(control.max, next));
  return { ...colour, [channel]: value };
};
