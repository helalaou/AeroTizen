import type { BackgroundScene } from "../contracts/backgrounds";

import { DEFAULT_CUSTOM_COLOUR } from "./colours";
import { DEFAULT_CUSTOM_GRADIENT, gradientBackground } from "./gradients";

export const blob = (color: string) => "radial-gradient(closest-side, " + color + ", rgba(0,0,0,0))";

export const SCENES: readonly BackgroundScene[] = [
  // animated
  {
    id: "aurora",
    anim: "blobs",
    base: "#04060b",
    blobs: ["rgba(32,178,150,.55)", "rgba(110,80,220,.50)", "rgba(40,120,220,.45)", "rgba(60,220,140,.30)"],
  },
  {
    id: "lava",
    anim: "blobs",
    base: "#0a0405",
    blobs: ["rgba(230,80,20,.50)", "rgba(200,30,80,.45)", "rgba(255,150,40,.35)", "rgba(140,20,120,.40)"],
  },
  {
    id: "nebula",
    anim: "blobs",
    base: "#05040c",
    stars: true,
    blobs: ["rgba(140,60,220,.45)", "rgba(220,70,160,.35)", "rgba(50,90,220,.40)", "rgba(80,40,160,.40)"],
  },
  {
    id: "neon",
    anim: "blobs",
    base: "#04040a",
    blobs: ["rgba(0,220,255,.40)", "rgba(255,0,170,.38)", "rgba(120,60,255,.40)", "rgba(0,140,255,.30)"],
  },
  {
    id: "calm",
    anim: "blobs",
    base: "#07090d",
    slow: true,
    blobs: ["rgba(90,120,170,.35)", "rgba(120,110,150,.30)", "rgba(70,110,130,.30)", "rgba(100,100,120,.25)"],
  },
  {
    id: "sakura",
    anim: "blobs",
    base: "#0b0609",
    blobs: ["rgba(240,120,170,.38)", "rgba(255,180,200,.25)", "rgba(180,80,150,.35)", "rgba(255,140,120,.22)"],
  },
  {
    id: "deepsea",
    anim: "blobs",
    base: "#020810",
    slow: true,
    blobs: ["rgba(0,110,160,.45)", "rgba(0,160,170,.30)", "rgba(20,60,140,.45)", "rgba(0,90,120,.35)"],
  },
  {
    id: "golden",
    anim: "blobs",
    base: "#0b0704",
    blobs: ["rgba(255,170,60,.40)", "rgba(230,100,80,.32)", "rgba(255,210,120,.22)", "rgba(170,70,100,.30)"],
  },
  {
    id: "synthwave",
    anim: "blobs",
    base: "linear-gradient(180deg,#0a0418 0%,#170626 60%,#2a0830 100%)",
    blobs: ["rgba(255,40,160,.38)", "rgba(90,40,255,.40)", "rgba(255,120,40,.25)", "rgba(0,200,255,.22)"],
  },
  {
    id: "arctic",
    anim: "blobs",
    base: "#050a10",
    slow: true,
    blobs: ["rgba(140,200,255,.30)", "rgba(200,230,255,.18)", "rgba(90,150,220,.32)", "rgba(160,220,240,.20)"],
  },
  {
    id: "mint",
    anim: "blobs",
    base: "#040a08",
    blobs: ["rgba(60,220,170,.32)", "rgba(40,160,200,.28)", "rgba(120,230,150,.22)", "rgba(30,120,110,.35)"],
  },
  { id: "starfield", anim: "stars", base: "#02030a" },
  {
    id: "snow",
    anim: "particles",
    kind: "snow",
    base: "linear-gradient(180deg,#0a1220 0%,#121c2c 100%)",
  },
  {
    id: "fireflies",
    anim: "particles",
    kind: "fireflies",
    base: "radial-gradient(1400px 900px at 50% 120%, #0d2216 0%, rgba(13,34,22,0) 60%), #030806",
  },
  {
    id: "rain",
    anim: "particles",
    kind: "rain",
    base: "linear-gradient(180deg,#070b12 0%,#0e1520 100%)",
  },
  {
    id: "waves",
    anim: "waves",
    base: "linear-gradient(180deg,#03101c 0%,#05243a 100%)",
  },
  {
    id: "stage",
    anim: "stage",
    base: "radial-gradient(4.2% 7.4% at 58.3% 12%, rgba(120,160,255,.32) 0%, rgba(120,160,255,.36) 80%, rgba(120,160,255,0) 100%), radial-gradient(2.7% 4.8% at 64.5% 17.2%, rgba(169,147,255,.3) 0%, rgba(169,147,255,.34) 80%, rgba(169,147,255,0) 100%), radial-gradient(3.6% 6.5% at 72.8% 26.7%, rgba(240,140,242,.28) 0%, rgba(240,140,242,.32) 80%, rgba(240,140,242,0) 100%), radial-gradient(3.6% 6.5% at 92.9% 21.5%, rgba(233,90,224,.34) 0%, rgba(233,90,224,.38) 80%, rgba(233,90,224,0) 100%), radial-gradient(3.2% 5.7% at 69.3% 42.1%, rgba(160,130,255,.24) 0%, rgba(160,130,255,.28) 80%, rgba(160,130,255,0) 100%), radial-gradient(2.8% 5% at 40% 40.9%, rgba(92,140,255,.2) 0%, rgba(92,140,255,.24) 80%, rgba(92,140,255,0) 100%), radial-gradient(11% 22% at 60% 0%, rgba(190,225,255,.82) 0%, rgba(190,225,255,0) 100%), radial-gradient(28% 56% at 77% 27%, rgba(175,145,255,.72) 0%, rgba(175,145,255,0) 100%), radial-gradient(15% 76% at 95% 42%, rgba(225,80,200,.68) 0%, rgba(225,80,200,0) 100%), linear-gradient(95deg, rgba(70,105,255,0) 45%, rgba(70,105,255,.66) 58%, rgba(70,105,255,0) 71%), radial-gradient(60% 80% at 62% 45%, rgba(58,74,168,.6) 0%, rgba(58,74,168,0) 100%), linear-gradient(0deg, rgba(6,7,14,.55) 0%, rgba(6,7,14,0) 50%), linear-gradient(90deg, #07080d 0%, #0b0d1e 30%, #18183f 100%)",
  },
  // static
  { id: "custom", category: "solid", base: DEFAULT_CUSTOM_COLOUR },
  { id: "black", category: "solid", base: "#000000" },
  { id: "solid-charcoal", category: "solid", base: "#303038" },
  { id: "solid-grey", category: "solid", base: "#92949a" },
  { id: "solid-white", category: "solid", base: "#ffffff" },
  { id: "solid-red", category: "solid", base: "#e53935" },
  { id: "solid-coral", category: "solid", base: "#ff7f73" },
  { id: "solid-orange", category: "solid", base: "#fb8c00" },
  { id: "solid-yellow", category: "solid", base: "#ffdf36" },
  { id: "solid-lime", category: "solid", base: "#b5db45" },
  { id: "solid-green", category: "solid", base: "#328549" },
  { id: "solid-teal", category: "solid", base: "#008577" },
  { id: "solid-cyan", category: "solid", base: "#00c4d4" },
  { id: "solid-sky", category: "solid", base: "#83c9f4" },
  { id: "solid-navy", category: "solid", base: "#15264a" },
  { id: "solid-indigo", category: "solid", base: "#4b50b5" },
  { id: "solid-purple", category: "solid", base: "#873cba" },
  { id: "solid-pink", category: "solid", base: "#f4a6ca" },
  { id: "solid-lavender", category: "solid", base: "#c7b3ed" },
  { id: "solid-brown", category: "solid", base: "#795548" },
  {
    id: "custom-gradient",
    category: "gradient",
    base: gradientBackground(DEFAULT_CUSTOM_GRADIENT),
  },
  {
    id: "midnight",
    base: "radial-gradient(1500px 900px at 15% -10%, #1d2a52 0%, rgba(29,42,82,0) 60%), #04060c",
  },
  { id: "graphite", base: "linear-gradient(180deg, #202126 0%, #0c0c0e 100%)" },
  {
    id: "dusk",
    base: "linear-gradient(160deg, #2a1838 0%, #12101c 45%, #07070b 100%)",
  },
  {
    id: "forest",
    base: "radial-gradient(1400px 900px at 10% 110%, #0f3324 0%, rgba(15,51,36,0) 60%), #040907",
  },
  {
    id: "ember",
    base: "radial-gradient(1400px 800px at 85% 115%, #4a1a08 0%, rgba(74,26,8,0) 60%), #0a0605",
  },
  {
    id: "ocean",
    base: "linear-gradient(170deg, #062a3a 0%, #04131d 55%, #02080d 100%)",
  },
  {
    id: "sunset",
    base: "linear-gradient(170deg, #3b1440 0%, #2a0f22 40%, #3d1a0c 80%, #120806 100%)",
  },
  {
    id: "navy",
    base: "linear-gradient(170deg, #0d1b3a 0%, #060c1c 60%, #03060e 100%)",
  },
  {
    id: "plum",
    base: "radial-gradient(1500px 900px at 20% -10%, #3a1846 0%, rgba(58,24,70,0) 60%), #0a050d",
  },
  {
    id: "mocha",
    base: "linear-gradient(165deg, #2e2018 0%, #17100c 55%, #0a0706 100%)",
  },
  {
    id: "slate",
    base: "linear-gradient(165deg, #2a3240 0%, #151a22 55%, #0a0d11 100%)",
  },
  {
    id: "tealnight",
    base: "radial-gradient(1400px 900px at 85% 110%, #0b3a3a 0%, rgba(11,58,58,0) 60%), #030a0b",
  },
  {
    id: "wine",
    base: "linear-gradient(165deg, #3a0f1c 0%, #1c070d 55%, #0b0306 100%)",
  },
  {
    id: "rose",
    base: "radial-gradient(1400px 900px at 80% -10%, #4a1430 0%, rgba(74,20,48,0) 60%), #0b0508",
  },
];

const STAGE_SWATCH =
  "repeating-linear-gradient(30deg, rgba(4,5,14,0.45) 0px, rgba(4,5,14,0.45) 0.8px, rgba(4,5,14,0) 0.8px, rgba(4,5,14,0) 2.4px), repeating-linear-gradient(120deg, rgba(4,5,14,0.45) 0px, rgba(4,5,14,0.45) 0.8px, rgba(4,5,14,0) 0.8px, rgba(4,5,14,0) 2.4px), linear-gradient(rgba(4,5,14,0.09), rgba(4,5,14,0.09)), radial-gradient(1px 1px at 45.3% 4.4%, #fff, transparent), radial-gradient(1px 1px at 48.8% 3.9%, #fff, transparent), radial-gradient(1px 1px at 73.4% 11.1%, #fff, transparent), radial-gradient(1px 1px at 81.3% 2.8%, #fff, transparent), radial-gradient(1px 1px at 88% 23.6%, #fff, transparent), radial-gradient(1px 1px at 95.3% 20.8%, #fff, transparent), radial-gradient(3.4% 6.1% at 61.7% 9.7%, rgba(205,225,255,0.33) 0%, rgba(205,225,255,0.41) 80%, rgba(205,225,255,0.55) 90%, rgba(205,225,255,0) 100%), radial-gradient(2.2% 3.9% at 63.8% 19.4%, rgba(150,170,255,0.27) 0%, rgba(150,170,255,0.34) 80%, rgba(150,170,255,0.45) 90%, rgba(150,170,255,0) 100%), radial-gradient(3.1% 5.6% at 71.6% 29.2%, rgba(185,160,255,0.3) 0%, rgba(185,160,255,0.38) 80%, rgba(185,160,255,0.5) 90%, rgba(185,160,255,0) 100%), radial-gradient(2.8% 5% at 66.9% 38.9%, rgba(160,130,255,0.27) 0%, rgba(160,130,255,0.34) 80%, rgba(160,130,255,0.45) 90%, rgba(160,130,255,0) 100%), radial-gradient(1.4% 2.5% at 76.4% 15.8%, rgba(220,170,255,0.27) 0%, rgba(220,170,255,0.34) 80%, rgba(220,170,255,0.45) 90%, rgba(220,170,255,0) 100%), radial-gradient(1.6% 2.8% at 78.9% 33.3%, rgba(185,160,255,0.24) 0%, rgba(185,160,255,0.3) 80%, rgba(185,160,255,0.4) 90%, rgba(185,160,255,0) 100%), radial-gradient(1.6% 2.8% at 84.8% 33.9%, rgba(190,150,255,0.24) 0%, rgba(190,150,255,0.3) 80%, rgba(190,150,255,0.4) 90%, rgba(190,150,255,0) 100%), radial-gradient(3.1% 5.6% at 93.8% 26.4%, rgba(240,110,230,0.33) 0%, rgba(240,110,230,0.41) 80%, rgba(240,110,230,0.55) 90%, rgba(240,110,230,0) 100%), radial-gradient(1.9% 3.3% at 93.8% 6.9%, rgba(240,140,242,0.24) 0%, rgba(240,140,242,0.3) 80%, rgba(240,140,242,0.4) 90%, rgba(240,140,242,0) 100%), radial-gradient(3.4% 6.1% at 90.6% 50%, rgba(225,90,210,0.18) 0%, rgba(225,90,210,0.22) 80%, rgba(225,90,210,0.3) 90%, rgba(225,90,210,0) 100%), radial-gradient(2.5% 4.4% at 98.1% 59.7%, rgba(235,120,230,0.18) 0%, rgba(235,120,230,0.22) 80%, rgba(235,120,230,0.3) 90%, rgba(235,120,230,0) 100%), radial-gradient(2.2% 3.9% at 64.1% 55%, rgba(120,150,255,0.21) 0%, rgba(120,150,255,0.26) 80%, rgba(120,150,255,0.35) 90%, rgba(120,150,255,0) 100%), radial-gradient(1.6% 2.8% at 73.4% 56.9%, rgba(140,140,255,0.18) 0%, rgba(140,140,255,0.22) 80%, rgba(140,140,255,0.3) 90%, rgba(140,140,255,0) 100%), radial-gradient(0.9% 1.7% at 54.4% 20%, rgba(120,160,255,0.27) 0%, rgba(120,160,255,0.34) 80%, rgba(120,160,255,0.45) 90%, rgba(120,160,255,0) 100%), radial-gradient(0.9% 1.7% at 61.7% 29.7%, rgba(130,170,255,0.27) 0%, rgba(130,170,255,0.34) 80%, rgba(130,170,255,0.45) 90%, rgba(130,170,255,0) 100%), radial-gradient(0.9% 1.7% at 54.1% 31.9%, rgba(120,160,255,0.21) 0%, rgba(120,160,255,0.26) 80%, rgba(120,160,255,0.35) 90%, rgba(120,160,255,0) 100%), radial-gradient(2.3% 4.2% at 37.2% 36.9%, rgba(100,130,240,0.18) 0%, rgba(100,130,240,0.22) 80%, rgba(100,130,240,0.3) 90%, rgba(100,130,240,0) 100%), radial-gradient(1.6% 2.8% at 41.9% 38.1%, rgba(100,130,240,0.18) 0%, rgba(100,130,240,0.22) 80%, rgba(100,130,240,0.3) 90%, rgba(100,130,240,0) 100%), radial-gradient(1.3% 2.2% at 32.8% 37.8%, rgba(100,130,240,0.17) 0%, rgba(100,130,240,0.21) 80%, rgba(100,130,240,0.28) 90%, rgba(100,130,240,0) 100%), radial-gradient(1.3% 2.2% at 30.2% 33.6%, rgba(90,120,230,0.15) 0%, rgba(90,120,230,0.19) 80%, rgba(90,120,230,0.25) 90%, rgba(90,120,230,0) 100%), radial-gradient(1.9% 3.3% at 22.7% 22.2%, rgba(80,100,200,0.12) 0%, rgba(80,100,200,0.15) 80%, rgba(80,100,200,0.2) 90%, rgba(80,100,200,0) 100%), radial-gradient(2.8% 5% at 45.6% 58.3%, rgba(90,110,220,0.12) 0%, rgba(90,110,220,0.15) 80%, rgba(90,110,220,0.2) 90%, rgba(90,110,220,0) 100%), radial-gradient(1.9% 3.3% at 53.6% 73.6%, rgba(90,110,220,0.11) 0%, rgba(90,110,220,0.14) 80%, rgba(90,110,220,0.18) 90%, rgba(90,110,220,0) 100%), radial-gradient(1.6% 2.8% at 83.3% 71.7%, rgba(190,110,220,0.12) 0%, rgba(190,110,220,0.15) 80%, rgba(190,110,220,0.2) 90%, rgba(190,110,220,0) 100%), radial-gradient(0.9% 1.7% at 92.2% 61.7%, rgba(240,140,242,0.21) 0%, rgba(240,140,242,0.26) 80%, rgba(240,140,242,0.35) 90%, rgba(240,140,242,0) 100%), radial-gradient(0.9% 1.7% at 88.8% 18.3%, rgba(240,150,242,0.21) 0%, rgba(240,150,242,0.26) 80%, rgba(240,150,242,0.35) 90%, rgba(240,150,242,0) 100%)";

// Small static rendering used for the Settings swatches.
const PARTICLE_PREVIEW = {
  snow: "#fff",
  rain: "rgba(170,200,255,.8)",
  fireflies: "#d9ff7a",
} as const;

export const preview = (b: BackgroundScene) => {
  if (b.anim === "blobs") {
    return (
      blob(b.blobs[0]) +
      " 10% 20%/70% 90% no-repeat," +
      blob(b.blobs[1]) +
      " 90% 80%/70% 90% no-repeat," +
      blob(b.blobs[2]) +
      " 60% 10%/60% 80% no-repeat," +
      b.base
    );
  }
  if (b.anim === "stars") {
    return (
      "radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent)," +
      "radial-gradient(1.5px 1.5px at 40% 80%, #cfe0ff, transparent), radial-gradient(1px 1px at 85% 20%, #fff, transparent)," +
      "radial-gradient(1px 1px at 55% 40%, #fff, transparent), " +
      b.base
    );
  }
  if (b.anim === "particles") {
    const dot = PARTICLE_PREVIEW[b.kind];
    return (
      "radial-gradient(2px 2px at 25% 30%, " +
      dot +
      ", transparent), radial-gradient(2px 2px at 65% 55%, " +
      dot +
      ", transparent)," +
      "radial-gradient(2px 2px at 45% 75%, " +
      dot +
      ", transparent), radial-gradient(2px 2px at 85% 25%, " +
      dot +
      ", transparent), " +
      b.base
    );
  }
  if (b.anim === "stage") {
    return STAGE_SWATCH + ", " + b.base;
  }
  if (b.anim === "waves") {
    return "linear-gradient(180deg, transparent 60%, rgba(40,140,200,.35) 60%, rgba(10,60,100,.6) 100%)," + b.base;
  }
  return b.base;
};
