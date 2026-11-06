import type { ColourChannels } from "../../backgrounds/colours";
import { channelsToColour } from "../../backgrounds/colours";
import type { BackgroundPreview } from "../../contracts/backgrounds";

export type ColourPickerDraft =
  | { readonly kind: "solid"; readonly colour: ColourChannels }
  | {
      readonly kind: "gradient";
      readonly colours: readonly [ColourChannels, ColourChannels];
      readonly activeStop: 0 | 1;
      readonly angle: number;
    };

export const COLOUR_CONTROLS = [
  { value: "hue", labelKey: "wallpaper.colour", max: 359, step: 1, unit: "°" },
  { value: "strength", labelKey: "wallpaper.strength", max: 100, step: 1, unit: "%" },
  { value: "lightness", labelKey: "wallpaper.lightness", max: 100, step: 1, unit: "%" },
] as const;

export type ColourChannel = keyof ColourChannels;

export const colourChannelValue = (colour: ColourChannels, channel: ColourChannel): number => {
  const value = Math.round(colour[channel]);
  return channel === "hue" ? value % 360 : value;
};

export const activeColour = (draft: ColourPickerDraft): ColourChannels =>
  draft.kind === "solid" ? draft.colour : draft.colours[draft.activeStop];

export const draftBackground = (draft: ColourPickerDraft): BackgroundPreview => {
  if (draft.kind === "solid") {
    return { kind: "solid", colour: channelsToColour(draft.colour) };
  }
  return {
    kind: "gradient",
    gradient: {
      start: channelsToColour(draft.colours[0]),
      end: channelsToColour(draft.colours[1]),
      angle: draft.angle,
    },
  };
};

export const adjustColourChannel = (colour: ColourChannels, channel: ColourChannel, direction: number) => {
  const control = COLOUR_CONTROLS.find((control) => control.value === channel);
  if (!control) {
    return colour;
  }
  const next = colourChannelValue(colour, channel) + direction * control.step;
  const value = channel === "hue" ? ((next % 360) + 360) % 360 : Math.max(0, Math.min(control.max, next));
  return { ...colour, [channel]: value };
};

export const adjustDraftColour = (
  draft: ColourPickerDraft,
  channel: ColourChannel,
  direction: number,
): ColourPickerDraft => {
  const colour = adjustColourChannel(activeColour(draft), channel, direction);
  if (draft.kind === "solid") {
    return { ...draft, colour };
  }
  const colours =
    draft.activeStop === 0 ? ([colour, draft.colours[1]] as const) : ([draft.colours[0], colour] as const);
  return { ...draft, colours };
};
