export interface ColourChannels {
  readonly hue: number;
  readonly lightness: number;
  readonly strength: number;
}

export const DEFAULT_CUSTOM_COLOUR = "#7c5cff";

export const normalizeColour = (value: unknown, fallback = DEFAULT_CUSTOM_COLOUR): string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

const rgbChannels = (colour: string) => {
  const hex = normalizeColour(colour);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
};

export const colourToChannels = (colour: string): ColourChannels => {
  const [red, green, blue] = rgbChannels(colour);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const difference = max - min;
  const lightness = (max + min) / 2;
  if (difference === 0) {
    // Retain a useful hue for greys; lightness and strength still match the saved colour.
    return { hue: 0, strength: 0, lightness: lightness * 100 };
  }
  const strength = difference / (1 - Math.abs(2 * lightness - 1));
  let hue = (red - green) / difference + 4;
  if (max === red) {
    hue = ((green - blue) / difference + 6) % 6;
  } else if (max === green) {
    hue = (blue - red) / difference + 2;
  }
  return { hue: hue * 60, strength: strength * 100, lightness: lightness * 100 };
};

export const channelsToColour = ({ hue, strength, lightness }: ColourChannels): string => {
  const saturation = strength / 100;
  const light = lightness / 100;
  const amplitude = saturation * Math.min(light, 1 - light);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const value = light - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + channel(0) + channel(8) + channel(4);
};

export const isLightColour = (colour: string): boolean => {
  const [red, green, blue] = rgbChannels(colour).map((value) =>
    value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4),
  );
  // Choose the higher-contrast black/white foreground by relative luminance.
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179;
};
