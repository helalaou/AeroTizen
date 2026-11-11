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
  {
    id: "prism",
    base: "radial-gradient(48.26% 63.2% at 101.58% 100%, rgba(122,52,16,.5) 0%, rgba(122,52,16,.48) 12.5%, rgba(122,52,16,.424) 25%, rgba(122,52,16,.343) 37.5%, rgba(122,52,16,.252) 50%, rgba(122,52,16,.166) 62.5%, rgba(122,52,16,.093) 75%, rgba(122,52,16,.038) 87.5%, rgba(122,52,16,0) 100%), radial-gradient(24% 34% at 46% 50%, rgba(210,182,255,.15) 0%, rgba(210,182,255,.144) 12.5%, rgba(210,182,255,.126) 25%, rgba(210,182,255,.102) 37.5%, rgba(210,182,255,.074) 50%, rgba(210,182,255,.048) 62.5%, rgba(210,182,255,.027) 75%, rgba(210,182,255,.011) 87.5%, rgba(210,182,255,0) 100%), radial-gradient(24% 38% at 8% 70%, rgba(255,108,158,.11) 0%, rgba(255,108,158,.105) 12.5%, rgba(255,108,158,.093) 25%, rgba(255,108,158,.074) 37.5%, rgba(255,108,158,.054) 50%, rgba(255,108,158,.035) 62.5%, rgba(255,108,158,.02) 75%, rgba(255,108,158,.008) 87.5%, rgba(255,108,158,0) 100%), radial-gradient(46.74% 58.64% at 107% 57.65%, rgba(255,133,56,.621) 0%, rgba(255,133,56,.6) 12.5%, rgba(255,133,56,.539) 25%, rgba(255,133,56,.449) 37.5%, rgba(255,133,56,.344) 50%, rgba(255,133,56,.237) 62.5%, rgba(255,133,56,.14) 75%, rgba(255,133,56,.061) 87.5%, rgba(255,133,56,0) 100%), radial-gradient(64.72% 64.02% at 102.96% 94.24%, rgba(203,107,50,.36) 0%, rgba(203,107,50,.349) 12.5%, rgba(203,107,50,.317) 25%, rgba(203,107,50,.269) 37.5%, rgba(203,107,50,.211) 50%, rgba(203,107,50,.15) 62.5%, rgba(203,107,50,.092) 75%, rgba(203,107,50,.041) 87.5%, rgba(203,107,50,0) 100%), radial-gradient(65.04% 63.59% at 10.35% 67.61%, rgba(208,5,124,.45) 0%, rgba(208,5,124,.432) 12.5%, rgba(208,5,124,.381) 25%, rgba(208,5,124,.309) 37.5%, rgba(208,5,124,.228) 50%, rgba(208,5,124,.15) 62.5%, rgba(208,5,124,.084) 75%, rgba(208,5,124,.034) 87.5%, rgba(208,5,124,0) 100%), radial-gradient(74.03% 137.99% at 96.56% -2.14%, rgba(4,128,166,.853) 0%, rgba(4,128,166,.821) 12.5%, rgba(4,128,166,.731) 25%, rgba(4,128,166,.601) 37.5%, rgba(4,128,166,.451) 50%, rgba(4,128,166,.304) 62.5%, rgba(4,128,166,.175) 75%, rgba(4,128,166,.074) 87.5%, rgba(4,128,166,0) 100%), radial-gradient(36.39% 85.54% at 48.53% 90.4%, rgba(52,22,176,.399) 0%, rgba(52,22,176,.386) 12.5%, rgba(52,22,176,.351) 25%, rgba(52,22,176,.298) 37.5%, rgba(52,22,176,.234) 50%, rgba(52,22,176,.166) 62.5%, rgba(52,22,176,.102) 75%, rgba(52,22,176,.046) 87.5%, rgba(52,22,176,0) 100%), radial-gradient(70.34% 89.53% at 51.83% -5.1%, rgba(16,76,173,.579) 0%, rgba(16,76,173,.561) 12.5%, rgba(16,76,173,.51) 25%, rgba(16,76,173,.433) 37.5%, rgba(16,76,173,.34) 50%, rgba(16,76,173,.242) 62.5%, rgba(16,76,173,.148) 75%, rgba(16,76,173,.067) 87.5%, rgba(16,76,173,0) 100%), radial-gradient(36.94% 68.35% at 6.38% 4.27%, rgba(146,19,72,.815) 0%, rgba(146,19,72,.79) 12.5%, rgba(146,19,72,.718) 25%, rgba(146,19,72,.609) 37.5%, rgba(146,19,72,.478) 50%, rgba(146,19,72,.34) 62.5%, rgba(146,19,72,.209) 75%, rgba(146,19,72,.094) 87.5%, rgba(146,19,72,0) 100%), radial-gradient(63.75% 83.99% at 58.42% 22.97%, #8a61a7 0%, #715791 50%, #86203a 100%)",
  },
  {
    id: "pastel",
    lightBackground: true,
    base: "radial-gradient(10.42% 18.52% at 89.58% 26.85%, rgba(255,222,236,.18) 0%, rgba(255,222,236,.18) 70%, rgba(255,222,236,.202) 78%, rgba(255,222,236,.157) 85%, rgba(255,222,236,.076) 90%, rgba(255,222,236,.022) 95%, rgba(255,222,236,0) 100%), radial-gradient(5.47% 9.72% at 41.67% 27.78%, rgba(220,226,255,.19) 0%, rgba(220,226,255,.19) 70%, rgba(220,226,255,.213) 78%, rgba(220,226,255,.166) 85%, rgba(220,226,255,.08) 90%, rgba(220,226,255,.023) 95%, rgba(220,226,255,0) 100%), radial-gradient(9.64% 17.13% at 47.92% 70.37%, rgba(255,236,250,.18) 0%, rgba(255,236,250,.18) 70%, rgba(255,236,250,.202) 78%, rgba(255,236,250,.157) 85%, rgba(255,236,250,.076) 90%, rgba(255,236,250,.022) 95%, rgba(255,236,250,0) 100%), radial-gradient(6.77% 12.04% at 85.42% 73.15%, rgba(255,232,214,.19) 0%, rgba(255,232,214,.19) 70%, rgba(255,232,214,.213) 78%, rgba(255,232,214,.166) 85%, rgba(255,232,214,.08) 90%, rgba(255,232,214,.023) 95%, rgba(255,232,214,0) 100%), radial-gradient(7.29% 12.96% at 14.06% 24.07%, rgba(255,232,222,.1) 0%, rgba(255,232,222,.1) 70%, rgba(255,232,222,.112) 78%, rgba(255,232,222,.087) 85%, rgba(255,232,222,.042) 90%, rgba(255,232,222,.012) 95%, rgba(255,232,222,0) 100%), radial-gradient(46% 74% at 8% -10%, rgba(255,252,244,.92) 0%, rgba(255,252,244,.89) 14.29%, rgba(255,252,244,.803) 28.57%, rgba(255,252,244,.665) 42.86%, rgba(255,252,244,.489) 57.14%, rgba(255,252,244,.294) 71.43%, rgba(255,252,244,.11) 85.71%, rgba(255,252,244,0) 100%), radial-gradient(62% 104% at 12% 103.6%, rgba(255,178,140,.6) 0%, rgba(255,178,140,.554) 14.29%, rgba(255,178,140,.43) 28.57%, rgba(255,178,140,.272) 42.86%, rgba(255,178,140,.128) 57.14%, rgba(255,178,140,.037) 71.43%, rgba(255,178,140,.003) 85.71%, rgba(255,178,140,0) 100%), radial-gradient(62% 69.5% at 86.9% 12.9%, rgba(164,211,255,.78) 0%, rgba(164,211,255,.715) 14.29%, rgba(164,211,255,.543) 28.57%, rgba(164,211,255,.329) 42.86%, rgba(164,211,255,.145) 57.14%, rgba(164,211,255,.038) 71.43%, rgba(164,211,255,.003) 85.71%, rgba(164,211,255,0) 100%), radial-gradient(78% 92% at 61.5% 71.8%, rgba(178,104,252,.32) 0%, rgba(178,104,252,.287) 14.29%, rgba(178,104,252,.205) 28.57%, rgba(178,104,252,.11) 42.86%, rgba(178,104,252,.04) 57.14%, rgba(178,104,252,.008) 71.43%, rgba(178,104,252,0) 85.71%, rgba(178,104,252,0) 100%), radial-gradient(51.4% 51.8% at 41.1% 34.3%, rgba(156,246,200,.44) 0%, rgba(156,246,200,.399) 14.29%, rgba(156,246,200,.292) 28.57%, rgba(156,246,200,.166) 42.86%, rgba(156,246,200,.066) 57.14%, rgba(156,246,200,.014) 71.43%, rgba(156,246,200,.001) 85.71%, rgba(156,246,200,0) 100%), linear-gradient(149.3deg, #fef7f1 0%, #eff0f1 33.3%, #dfe7fd 66.7%, #ffc6dd 100%)",
  },
  {
    id: "afterglow",
    base: "linear-gradient(180deg, rgba(60,12,72,.6) 0%, rgba(60,12,72,.46) 5%, rgba(60,12,72,.25) 10%, rgba(60,12,72,.08) 16%, rgba(60,12,72,0) 22%, rgba(22,8,30,0) 60%, rgba(22,8,30,.15) 75%, rgba(22,8,30,.32) 88%, rgba(18,6,24,.48) 100%), radial-gradient(closest-side, rgba(44,63,160,.22) 0%, rgba(44,63,160,.207) 15%, rgba(44,63,160,.176) 30%, rgba(44,63,160,.132) 45%, rgba(44,63,160,.084) 60%, rgba(44,63,160,.04) 75%, rgba(44,63,160,.013) 88%, rgba(44,63,160,0) 100%) 12.61% -4.84% / 5.83% 42.59% no-repeat, radial-gradient(closest-side, rgba(38,56,140,.2) 0%, rgba(38,56,140,.188) 15%, rgba(38,56,140,.16) 30%, rgba(38,56,140,.12) 45%, rgba(38,56,140,.076) 60%, rgba(38,56,140,.036) 75%, rgba(38,56,140,.012) 88%, rgba(38,56,140,0) 100%) 21.19% 84.38% / 5.62% 40.74% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.5) 0%, rgba(51,82,214,.465) 25%, rgba(51,82,214,.38) 45%, rgba(51,82,214,.275) 60%, rgba(51,82,214,.15) 75%, rgba(51,82,214,.05) 88%, rgba(51,82,214,0) 100%) 14.13% -12.2% / 13.75% 22.59% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.46) 0%, rgba(51,82,214,.428) 25%, rgba(51,82,214,.35) 45%, rgba(51,82,214,.253) 60%, rgba(51,82,214,.138) 75%, rgba(51,82,214,.046) 88%, rgba(51,82,214,0) 100%) 13.83% 6.62% / 10% 18.89% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.48) 0%, rgba(51,82,214,.446) 25%, rgba(51,82,214,.365) 45%, rgba(51,82,214,.264) 60%, rgba(51,82,214,.144) 75%, rgba(51,82,214,.048) 88%, rgba(51,82,214,0) 100%) 18.24% 21.7% / 13.12% 21.48% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.44) 0%, rgba(51,82,214,.409) 25%, rgba(51,82,214,.334) 45%, rgba(51,82,214,.242) 60%, rgba(51,82,214,.132) 75%, rgba(51,82,214,.044) 88%, rgba(51,82,214,0) 100%) 20.57% 38.74% / 9.38% 17.78% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.48) 0%, rgba(51,82,214,.446) 25%, rgba(51,82,214,.365) 45%, rgba(51,82,214,.264) 60%, rgba(51,82,214,.144) 75%, rgba(51,82,214,.048) 88%, rgba(51,82,214,0) 100%) 21.87% 55.95% / 13.75% 22.22% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.44) 0%, rgba(51,82,214,.409) 25%, rgba(51,82,214,.334) 45%, rgba(51,82,214,.242) 60%, rgba(51,82,214,.132) 75%, rgba(51,82,214,.044) 88%, rgba(51,82,214,0) 100%) 24.03% 72.83% / 10% 18.89% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.44) 0%, rgba(51,82,214,.409) 25%, rgba(51,82,214,.334) 45%, rgba(51,82,214,.242) 60%, rgba(51,82,214,.132) 75%, rgba(51,82,214,.044) 88%, rgba(51,82,214,0) 100%) 30.79% 89.91% / 13.12% 21.11% no-repeat, radial-gradient(closest-side, rgba(51,82,214,.4) 0%, rgba(51,82,214,.372) 25%, rgba(51,82,214,.304) 45%, rgba(51,82,214,.22) 60%, rgba(51,82,214,.12) 75%, rgba(51,82,214,.04) 88%, rgba(51,82,214,0) 100%) 39.77% 106.45% / 12.71% 19.63% no-repeat, radial-gradient(closest-side, rgba(74,109,255,.3) 0%, rgba(74,109,255,.282) 15%, rgba(74,109,255,.24) 30%, rgba(74,109,255,.18) 45%, rgba(74,109,255,.114) 60%, rgba(74,109,255,.054) 75%, rgba(74,109,255,.018) 88%, rgba(74,109,255,0) 100%) 30.33% -325% / 21.88% 96.3% no-repeat, radial-gradient(closest-side, rgba(148,72,226,.15) 0%, rgba(148,72,226,.141) 15%, rgba(148,72,226,.12) 30%, rgba(148,72,226,.09) 45%, rgba(148,72,226,.057) 60%, rgba(148,72,226,.027) 75%, rgba(148,72,226,.009) 88%, rgba(148,72,226,0) 100%) 54.55% 325% / 31.25% 103.7% no-repeat, radial-gradient(closest-side, rgba(255,192,138,.76) 0%, rgba(255,192,138,.714) 15%, rgba(255,192,138,.608) 30%, rgba(255,192,138,.456) 45%, rgba(255,192,138,.289) 60%, rgba(255,192,138,.137) 75%, rgba(255,192,138,.046) 88%, rgba(255,192,138,0) 100%) 147.96% -52.5% / 48.96% 62.96% no-repeat, linear-gradient(256deg, rgb(244,102,86) 0%, rgb(250,102,88) 5.7%, rgb(248,94,96) 11.2%, rgb(255,92,119) 16.7%, rgb(255,85,142) 22.1%, rgb(253,75,143) 27.6%, rgb(228,70,159) 33.1%, rgb(194,68,190) 38.6%, rgb(161,67,221) 44.1%, rgb(143,68,231) 49.5%, rgb(110,81,244) 55%, rgb(64,101,255) 60.5%, rgb(58,93,240) 64.5%, rgb(47,76,200) 68%, rgb(35,53,144) 71.5%, rgb(27,37,96) 74.5%, rgb(23,29,72) 78%, rgb(19,23,60) 83%, rgb(16,19,50) 89%, rgb(11,14,38) 100%)",
  },
  {
    id: "twilightpeaks",
    base: "conic-gradient(from 163deg at 50% 0%, rgba(11,5,20,0) 0deg, rgb(11,5,20) 0.6deg, rgb(11,5,20) 33.4deg, rgba(11,5,20,0) 34deg) 0.603% 100% / 0.677% 8.519% repeat-x, conic-gradient(from 167deg at 50% 0%, rgba(11,5,20,0) 0deg, rgb(11,5,20) 0.6deg, rgb(11,5,20) 25.4deg, rgba(11,5,20,0) 26deg) 1.186% 100% / 1.198% 10.37% repeat-x, conic-gradient(from 170deg at 50% 0%, rgba(11,5,20,0) 0deg, rgb(11,5,20) 0.6deg, rgb(11,5,20) 19.4deg, rgba(11,5,20,0) 20deg) 0.453% 100% / 2.24% 12.222% repeat-x, linear-gradient(180deg, rgba(194,122,174,0) 0%, rgba(194,122,174,0) 24.074%, rgba(200,100,154,0.14) 40.741%, rgba(207,114,166,0.2) 50%, rgba(184,138,189,0.3) 55.556%, rgba(173,142,196,0.36) 59.259%, rgba(171,141,196,0.28) 62.963%, rgba(169,140,196,0.2) 66.204%, rgba(157,127,189,0.1) 68.981%, rgba(90,64,128,0) 71.296%, rgba(28,15,51,0.3) 74.074%, rgba(28,15,51,0.3) 81.481%, rgba(106,74,144,0.22) 84.722%, rgba(122,88,160,0.45) 88.426%, rgba(124,90,162,0.58) 92.593%, rgba(124,90,162,0.6) 100%), conic-gradient(from 105deg at 42.4% 0%, rgba(67,40,104,0) 0deg, rgb(67,40,104) 0.5deg, rgb(67,40,104) 144.5deg, rgba(67,40,104,0) 145deg) 32.705% 100% / 33.333% 35.926% repeat-x, conic-gradient(from 112deg at 43.18% 0%, rgba(67,40,104,0) 0deg, rgb(67,40,104) 0.5deg, rgb(67,40,104) 129.5deg, rgba(67,40,104,0) 130deg) 8.085% 100% / 12.135% 31.667% repeat-x, conic-gradient(from 121deg at 55.2% 0%, rgba(128,89,156,0) 0deg, rgb(128,89,156) 0.5deg, rgb(128,89,156) 122.5deg, rgba(128,89,156,0) 123deg) 11.282% 100% / 18.073% 52.593% repeat-x, conic-gradient(from 117deg at 43.03% 0%, rgba(128,89,156,0) 0deg, rgb(128,89,156) 0.5deg, rgb(128,89,156) 118.5deg, rgba(128,89,156,0) 119deg) 3.815% 100% / 10.99% 50% repeat-x, radial-gradient(52.083% 31.481% at 66.146% 54.63%, rgba(255,198,212,0.97) 0%, rgba(255,178,200,0.94) 10%, rgba(247,151,190,0.82) 22%, rgba(228,123,176,0.6) 36%, rgba(201,98,159,0.36) 52%, rgba(168,80,143,0.14) 70%, rgba(138,67,132,0.04) 86%, rgba(138,67,132,0) 100%), radial-gradient(circle at 37px 97px, rgba(255,244,251,0.78) 0px, rgba(255,244,251,0.78) 0.55px, rgba(255,244,251,0) 1.5px) 0 0 / 211px 157px, radial-gradient(circle at 251px 170px, rgba(228,216,255,0.62) 0px, rgba(228,216,255,0.62) 0.5px, rgba(228,216,255,0) 1.4px) 0 0 / 337px 229px, linear-gradient(180deg, rgb(14,7,34) 0%, rgb(23,11,46) 12.963%, rgb(35,17,62) 24.074%, rgb(50,26,82) 33.333%, rgb(71,35,95) 39.815%, rgb(102,48,110) 45.37%, rgb(134,64,124) 50%, rgb(154,76,132) 55.556%, rgb(154,76,132) 100%)",
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
