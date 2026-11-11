import { ASPECT, LAYER_HEIGHT, LAYER_WIDTH, STAGE_HEIGHT, STAGE_WIDTH, TAU } from "./stageGeometry";
import type { StageLook } from "./stageLook";
import { NOISE_SIZE } from "./stageNoise";

// Written for the TV browser (Chromium 69, WebGL 1): GLSL ES 1.00 without loops, and mediump floats, so the renderer
// wraps every animated value before it reaches a shader.

// Text over the wallpaper keeps a 3:1 contrast: the light is dimmed by STATUS_SHADE over the header status, then a soft
// knee caps the luminance from GUARD_KNEE towards GUARD_CAP behind the header text and icons.
const STATUS_SHADE = 0.65;
const GUARD_KNEE = 0.12;
const GUARD_CAP = 0.17;

export const SCENE_ATTRIBUTES = ["aPosition"];
export const SPRITE_ATTRIBUTES = ["aCorner", "aSprite", "aLook", "aMotion", "aShine", "aTint"];

// Six significant digits: inverse buffer dimensions need more than a fixed number of decimals.
const glslFloat = (x: number) => {
  const text = String(Number(x.toPrecision(6)));
  return text.includes(".") || text.includes("e") ? text : text + ".0";
};

const glslVec = (values: readonly number[]) => "vec" + values.length + "(" + values.map(glslFloat).join(", ") + ")";

// `a` is clamped before it is squared, to stay within the mediump range.
const BEAM_FUNCTION = `
float beam(vec2 q, vec2 dir, float w0, float spread, float fall, float core) {
  float along = dot(q, dir);
  float across = abs(q.x * dir.y - q.y * dir.x);
  float width = w0 + spread * max(along, 0.0);
  float a = min(across / width, 5.0);
  float a2 = a * a;
  float shape = exp(-a2 * 0.75) + core * exp(-a2 * 5.0);
  return shape * exp(-fall * along) * (0.1 / (0.1 + width)) * smoothstep(-0.05, 0.1, along);
}`;

const lightAt = (look: StageLook, position: string) =>
  look.beams
    .map((beam, index) => {
      const direction = "uBeam[" + (index >> 1) + "]." + (index % 2 ? "zw" : "xy");
      const source = glslVec([beam.source.x, beam.source.y]);
      const shape = [beam.sourceWidth, beam.spread, beam.depthFalloff, beam.coreWeight].map(glslFloat).join(", ");
      return `uColor[${index}] * beam(${position} - ${source}, ${direction}, ${shape})`;
    })
    .join("\n    + ");

const glowSum = (look: StageLook) =>
  look.glows
    .map((glow) => {
      const centre = glslVec([glow.centre.x, glow.centre.y]);
      const inverseRadius = glslVec([1 / glow.radius.x, 1 / glow.radius.y]);
      return `${glslVec(glow.colour)} * (1.0 + ${glslFloat(glow.pulse)} * uFlow.w) * glow(p, ${centre}, ${inverseRadius})`;
    })
    .join("\n    + ");

export const SCENE_VERTEX = "attribute vec2 aPosition;\nvoid main() { gl_Position = vec4(aPosition, 0.0, 1.0); }\n";

export const sceneFragment = (look: StageLook) => `
precision mediump float;
uniform sampler2D uNoise;
uniform sampler2D uSprites;
uniform vec4 uBeam[${Math.ceil(look.beams.length / 2)}];
uniform vec3 uColor[${look.beams.length}];
uniform vec4 uHaze;
uniform vec4 uFlow;
uniform vec4 uGrain;
const float ASPECT = ${glslFloat(ASPECT)};
const vec2 PIXEL = vec2(${glslFloat(1 / STAGE_WIDTH)}, ${glslFloat(1 / STAGE_HEIGHT)});
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${BEAM_FUNCTION}
float glow(vec2 p, vec2 at, vec2 invSize) {
  vec2 d = (p - at) * invSize;
  return exp(-dot(d, d));
}
void main() {
  vec2 uv = gl_FragCoord.xy * PIXEL;
  vec2 p = vec2(uv.x * ASPECT, uv.y);
  vec2 c = p - vec2(${glslFloat(ASPECT / 2)}, 0.5);
  vec2 w = c + (texture2D(uNoise, c * 0.17 + uFlow.xy).rg - 0.5) * 0.6;
  float hazeA = texture2D(uNoise, mat2(0.92, 0.39, -0.39, 0.92) * w * 0.42 + uHaze.xy).r;
  float hazeB = texture2D(uNoise, mat2(0.75, -0.66, 0.66, 0.75) * w * 0.95 + uHaze.zw).g;
  float haze = smoothstep(0.2, 0.8, hazeA * 0.65 + hazeB * 0.35) * uFlow.z;
  vec3 light = ${lightAt(look, "p")};
  vec3 ambient = ${glslVec(look.ambient)}
    + ${glowSum(look)};
  float status = smoothstep(0.8, 0.93, uv.y) * smoothstep(0.615, 0.66, uv.x);
  vec3 hdr = (ambient * (1.0 + 0.5 * haze) + light * (${glslFloat(look.haze.base)} + ${glslFloat(look.haze.amount)}
    * haze)) * (1.0 - ${glslFloat(STATUS_SHADE)} * status);
  hdr *= mix(${glslFloat(1 - look.bottomShade)}, 1.0, smoothstep(0.0, 0.5, uv.y));
  hdr *= mix(${glslFloat(1 - look.leftShade)}, 1.0, smoothstep(0.0, 0.6, uv.x));
  vec3 col = sqrt(min(hdr * (1.0 + hdr * ${glslFloat(1 / (look.whitePoint * look.whitePoint))}) / (1.0 + hdr), vec3(1.0)));
  col += texture2D(uSprites, uv).rgb;
  float guard = smoothstep(0.8, 0.93, uv.y) * max(smoothstep(0.615, 0.66, uv.x), 1.0 - smoothstep(0.16, 0.22, uv.x));
  float lum = dot(col * col, LUMA);
  float knee = mix(1.0, ${glslFloat(GUARD_KNEE)}, guard);
  float range = mix(1.0, ${glslFloat(GUARD_CAP - GUARD_KNEE)}, guard);
  float capped = knee + range * (1.0 - exp((knee - max(lum, knee)) / range));
  col *= mix(1.0, sqrt(capped / max(lum, knee)), step(knee, lum));
  vec4 n = texture2D(uNoise, (mod(gl_FragCoord.xy, 256.0) + uGrain.xy) * ${glslFloat(1 / NOISE_SIZE)});
  gl_FragColor = vec4(col + (n.b + n.a - 1.0) * (uGrain.z * (0.3 + col) + 1.0 / 255.0), 1.0);
}`;

export const spriteVertex = (look: StageLook) => `
attribute vec2 aCorner;
attribute vec4 aSprite;
attribute vec4 aLook;
attribute vec4 aMotion;
attribute vec4 aShine;
attribute vec4 aTint;
uniform vec4 uBeam[${Math.ceil(look.beams.length / 2)}];
uniform vec3 uColor[${look.beams.length}];
uniform vec4 uLoop;
varying vec2 vCorner;
varying vec3 vColor;
varying vec4 vLook;
const float ASPECT = ${glslFloat(ASPECT)};
${BEAM_FUNCTION}
void main() {
  float wx = aMotion.z * uLoop.x + aMotion.w;
  float wy = (aMotion.z + 1.0) * uLoop.x + aMotion.w * 1.7;
  vec2 centre = aSprite.xy + aMotion.xy * vec2(sin(wx), sin(wy));
  float moving = step(0.001, aShine.x);
  float progress = fract(aSprite.y + aShine.x * uLoop.x * ${glslFloat(1 / TAU)});
  centre.y = mix(centre.y, ${glslFloat(look.rising.from)} + progress * ${glslFloat(look.rising.to - look.rising.from)}
    + aMotion.y * sin(wy), moving);
  float life = mix(1.0, smoothstep(0.0, 0.4, progress) * (1.0 - smoothstep(0.85, 1.0, progress)), moving);
  vec3 light = ${lightAt(look, "centre")};
  float peak = max(light.r, max(light.g, light.b));
  float lit = min(peak, 1.0);
  vec3 tint = mix(aTint.rgb, light / max(peak, 0.001), aTint.a * lit);
  float wave = 0.5 + 0.5 * sin(aShine.z * uLoop.y + aShine.w);
  float twinkle = mix(0.72 + 0.28 * wave, wave * wave * wave, aLook.z);
  float pulse = 1.0 + 0.18 * uLoop.z * (0.6 + 0.4 * sin(aShine.w * 3.0)) + ${glslFloat(look.swell.gain)} * uLoop.w;
  float shine = aShine.y * (1.0 - 0.45 * aTint.a + 0.45 * aTint.a * lit) * twinkle * pulse * life;
  vColor = tint * shine;
  vCorner = aCorner * aSprite.w;
  vLook = aLook;
  vec2 clip = centre * vec2(2.0 / ASPECT, 2.0) - 1.0;
  gl_Position = vec4(clip + aCorner * aSprite.w * aSprite.z * vec2(${glslFloat(2 / LAYER_WIDTH)}, ${glslFloat(2 / LAYER_HEIGHT)}),
    0.0, 1.0);
}`;

export const SPRITE_FRAGMENT = `
precision mediump float;
varying vec2 vCorner;
varying vec3 vColor;
varying vec4 vLook;
const float SPARKLE_THRESHOLD = 0.5;
void main() {
  float r = length(vCorner);
  float shape;
  // Sprite kind is constant across each quad, so a bubble skips sparkle calculations and vice versa.
  if (vLook.z < SPARKLE_THRESHOLD) {
    float edge = vLook.x;
    float disc = 1.0 - smoothstep(1.0 - edge, 1.0, r);
    float body = 0.62 + 0.38 * smoothstep(0.0, 0.92, r);
    float ring = smoothstep(1.0 - 2.6 * edge, 1.0 - 0.8 * edge, r) * disc;
    float halo = 0.08 * (1.0 - smoothstep(0.75, 1.4, r));
    shape = disc * body + vLook.y * ring + halo;
  } else {
    vec2 a = abs(vCorner);
    shape = exp(-r * r * 9.0) + vLook.w * (exp(-a.x * 26.0 - a.y * 2.6) + exp(-a.y * 26.0 - a.x * 2.6));
  }
  gl_FragColor = vec4(vColor * shape, 1.0);
}`;
