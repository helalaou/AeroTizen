import type { BackgroundScene } from "../contracts/backgrounds";

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
  // static
  { id: "black", base: "#000" },
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
  if (b.anim === "waves") {
    return "linear-gradient(180deg, transparent 60%, rgba(40,140,200,.35) 60%, rgba(10,60,100,.6) 100%)," + b.base;
  }
  return b.base;
};
