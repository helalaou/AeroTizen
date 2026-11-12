export type Rgb = readonly [number, number, number];

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Range {
  readonly max: number;
  readonly min: number;
}

interface Sway {
  readonly amplitude: number;
  readonly phase: number;
  readonly seconds: number;
}

export interface StageBeam {
  readonly colours: {
    readonly cycleSeconds: number;
    readonly from: string;
    readonly phase: number;
    readonly to: string;
  };
  readonly coreWeight: number;
  readonly depthFalloff: number;
  readonly gain: number;
  readonly restAngle: number;
  readonly source: Point;
  readonly sourceWidth: number;
  readonly spread: number;
  readonly sway: readonly Sway[];
}

export interface StageGlow {
  readonly centre: Point;
  readonly colour: Rgb;
  readonly pulse: number;
  readonly radius: Point;
}

export interface StageBubble {
  readonly edge: number;
  readonly gain: number;
  readonly palette: number;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

export interface StageLook {
  readonly ambient: Rgb;
  readonly beams: readonly StageBeam[];
  readonly bottomShade: number;
  readonly bubbleLightTint: number;
  readonly bubbles: readonly StageBubble[];
  readonly drift: number;
  readonly extraBubbles: {
    readonly count: number;
    readonly gain: Range;
    readonly radius: Range;
    readonly seed: number;
    readonly x: Range;
    readonly y: Range;
  };
  readonly glows: readonly StageGlow[];
  readonly grain: number;
  readonly haze: { readonly amount: number; readonly base: number };
  readonly leftShade: number;
  readonly palette: readonly string[];
  readonly rising: {
    readonly from: number;
    readonly loops: Range;
    readonly maxGain: number;
    readonly share: number;
    readonly to: number;
  };
  readonly sparkles: {
    readonly count: number;
    readonly gain: Range;
    readonly glintShare: number;
    readonly lightTint: number;
    readonly seed: number;
    readonly size: Range;
    readonly x: Range;
    readonly y: Range;
  };
  readonly swell: { readonly gain: number; readonly seconds: number };
  readonly whitePoint: number;
}

export const srgbColour = (hex: string): Rgb => {
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

export const srgbToLinear = (hex: string, gain = 1): Rgb => {
  const [r, g, b] = srgbColour(hex).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * gain);
  return [r, g, b];
};

// Beams and glows are placed in screen units: x from 0 to 16/9, y from 0 at the bottom to 1. Bubbles and sparkles are
// placed in pixels of the 1920x1080 layer, from its top left corner.
export const STAGE_LOOK: StageLook = {
  whitePoint: 2.4,
  ambient: srgbToLinear("#08090f"),
  glows: [
    { centre: { x: 1.1, y: 0.62 }, radius: { x: 0.62, y: 0.9 }, colour: srgbToLinear("#3a4aa8", 0.36), pulse: 0.08 },
    { centre: { x: 1.11, y: 0.99 }, radius: { x: 0.09, y: 0.1 }, colour: srgbToLinear("#b4dcff", 0.6), pulse: 0.12 },
    { centre: { x: 1.4, y: 0.8 }, radius: { x: 0.3, y: 0.2 }, colour: srgbToLinear("#a58cff", 0.45), pulse: 0.1 },
    { centre: { x: 1.66, y: 0.5 }, radius: { x: 0.16, y: 0.7 }, colour: srgbToLinear("#a03aa0", 0.14), pulse: 0.1 },
  ],
  bottomShade: 0.45,
  leftShade: 0.55,
  beams: [
    {
      source: { x: 1.09, y: 1.3 },
      restAngle: -1.668,
      sourceWidth: 0.05,
      spread: 0.11,
      depthFalloff: 0.8,
      coreWeight: 0.5,
      colours: { from: "#3d5dff", to: "#4870ff", cycleSeconds: 26, phase: 0 },
      gain: 3.2,
      sway: [
        { amplitude: 0.1, seconds: 9, phase: 0 },
        { amplitude: 0.03, seconds: 4.1, phase: 1.2 },
      ],
    },
    {
      source: { x: 1.075, y: 1.18 },
      restAngle: -1.62,
      sourceWidth: 0.03,
      spread: 0.06,
      depthFalloff: 3.5,
      coreWeight: 0.5,
      colours: { from: "#8ae8ff", to: "#b0d0ff", cycleSeconds: 17, phase: 1 },
      gain: 2.0,
      sway: [
        { amplitude: 0.09, seconds: 7, phase: 2.1 },
        { amplitude: 0.03, seconds: 3.1, phase: 0.4 },
      ],
    },
    {
      source: { x: 1.32, y: 1.18 },
      restAngle: -1.5,
      sourceWidth: 0.06,
      spread: 0.22,
      depthFalloff: 2.6,
      coreWeight: 0.15,
      colours: { from: "#a68cff", to: "#bf9aff", cycleSeconds: 21, phase: 2 },
      gain: 3.2,
      sway: [
        { amplitude: 0.11, seconds: 8.5, phase: 4.0 },
        { amplitude: 0.03, seconds: 3.7, phase: 2.0 },
      ],
    },
    {
      source: { x: 1.52, y: 1.2 },
      restAngle: -1.45,
      sourceWidth: 0.03,
      spread: 0.1,
      depthFalloff: 2.7,
      coreWeight: 0.3,
      colours: { from: "#7a5cff", to: "#9a4dff", cycleSeconds: 19, phase: 3 },
      gain: 1.2,
      sway: [
        { amplitude: 0.12, seconds: 9.5, phase: 1.0 },
        { amplitude: 0.03, seconds: 4.3, phase: 3.0 },
      ],
    },
    {
      source: { x: 1.66, y: 1.32 },
      restAngle: -1.585,
      sourceWidth: 0.03,
      spread: 0.065,
      depthFalloff: 1.2,
      coreWeight: 0.35,
      colours: { from: "#ff3fd0", to: "#ff4f9a", cycleSeconds: 23, phase: 4 },
      gain: 1.35,
      sway: [
        { amplitude: 0.08, seconds: 10.5, phase: 5.0 },
        { amplitude: 0.03, seconds: 3.9, phase: 1.0 },
      ],
    },
    {
      source: { x: 1.58, y: 1.25 },
      restAngle: -1.75,
      sourceWidth: 0.015,
      spread: 0.05,
      depthFalloff: 2.8,
      coreWeight: 0.5,
      colours: { from: "#ff7ae0", to: "#d07aff", cycleSeconds: 15, phase: 5 },
      gain: 1.0,
      sway: [
        { amplitude: 0.1, seconds: 7.5, phase: 2.6 },
        { amplitude: 0.03, seconds: 2.9, phase: 0.7 },
      ],
    },
  ],
  haze: { base: 0.62, amount: 0.65 },
  swell: { seconds: 32, gain: 0.22 },
  palette: ["#5c8cff", "#7d8cff", "#a993ff", "#f08cf2", "#e95ae0", "#62c8ff", "#8a6dff"],
  bubbles: [
    { x: 1120, y: 130, radius: 80, palette: 0, gain: 0.34, edge: 0.22 },
    { x: 1238, y: 186, radius: 52, palette: 2, gain: 0.34, edge: 0.18 },
    { x: 1398, y: 288, radius: 70, palette: 3, gain: 0.3, edge: 0.2 },
    { x: 1330, y: 455, radius: 62, palette: 6, gain: 0.26, edge: 0.2 },
    { x: 1428, y: 186, radius: 28, palette: 3, gain: 0.32, edge: 0.16 },
    { x: 1784, y: 232, radius: 70, palette: 4, gain: 0.36, edge: 0.2 },
    { x: 1612, y: 332, radius: 36, palette: 6, gain: 0.26, edge: 0.18 },
    { x: 1556, y: 384, radius: 32, palette: 6, gain: 0.2, edge: 0.18 },
    { x: 1884, y: 302, radius: 24, palette: 1, gain: 0.2, edge: 0.18 },
    { x: 768, y: 442, radius: 54, palette: 0, gain: 0.22, edge: 0.22 },
    { x: 824, y: 394, radius: 34, palette: 0, gain: 0.26, edge: 0.18 },
    { x: 1016, y: 374, radius: 26, palette: 1, gain: 0.24, edge: 0.18 },
    { x: 1255, y: 302, radius: 26, palette: 5, gain: 0.2, edge: 0.16 },
    { x: 1762, y: 120, radius: 42, palette: 3, gain: 0.18, edge: 0.2 },
    { x: 948, y: 232, radius: 96, palette: 0, gain: 0.13, edge: 0.42 },
    { x: 1520, y: 230, radius: 110, palette: 2, gain: 0.12, edge: 0.45 },
    { x: 1700, y: 505, radius: 84, palette: 4, gain: 0.15, edge: 0.38 },
    { x: 1185, y: 588, radius: 46, palette: 0, gain: 0.18, edge: 0.2 },
    { x: 1460, y: 642, radius: 36, palette: 6, gain: 0.15, edge: 0.2 },
    { x: 1845, y: 662, radius: 58, palette: 3, gain: 0.16, edge: 0.24 },
    { x: 672, y: 612, radius: 30, palette: 0, gain: 0.11, edge: 0.2 },
    { x: 1060, y: 782, radius: 44, palette: 1, gain: 0.09, edge: 0.26 },
    { x: 1630, y: 792, radius: 30, palette: 4, gain: 0.1, edge: 0.2 },
    { x: 560, y: 312, radius: 28, palette: 0, gain: 0.1, edge: 0.2 },
    { x: 1310, y: 862, radius: 120, palette: 0, gain: 0.06, edge: 0.5 },
    { x: 1150, y: 332, radius: 20, palette: 5, gain: 0.24, edge: 0.14 },
    { x: 1680, y: 162, radius: 22, palette: 2, gain: 0.24, edge: 0.14 },
    { x: 880, y: 602, radius: 68, palette: 1, gain: 0.08, edge: 0.45 },
    { x: 1500, y: 962, radius: 76, palette: 4, gain: 0.06, edge: 0.45 },
    { x: 420, y: 202, radius: 44, palette: 0, gain: 0.05, edge: 0.42 },
  ],
  bubbleLightTint: 0.55,
  extraBubbles: {
    count: 8,
    x: { min: 950, max: 1880 },
    y: { min: 80, max: 560 },
    radius: { min: 10, max: 18 },
    gain: { min: 0.16, max: 0.3 },
    seed: 61106,
  },
  // Only bubbles fainter than maxGain rise, so no bright bubble crosses the text lower down.
  rising: { share: 0.35, from: 0.08, to: 1.08, loops: { min: 3, max: 5 }, maxGain: 0.19 },
  drift: 1.8,
  sparkles: {
    count: 90,
    x: { min: 880, max: 1920 },
    y: { min: 0, max: 640 },
    size: { min: 1.6, max: 3.2 },
    gain: { min: 0.7, max: 1.2 },
    glintShare: 0.2,
    lightTint: 0.35,
    seed: 1106,
  },
  grain: 0.05,
};
