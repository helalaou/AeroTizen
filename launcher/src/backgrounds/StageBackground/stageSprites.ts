import { LAYER_PIXEL, TAU } from "./stageGeometry";
import type { Range, Rgb, StageLook } from "./stageLook";
import { srgbColour } from "./stageLook";
import { seededRandom } from "./stageNoise";

export const SPRITE_FLOATS = 22;
const SPRITE_SEED = 19061106;
const BUBBLE = 0;
const SPARKLE = 1;
const SPARKLE_TINT: Rgb = [0.92, 0.92, 1];
const QUAD_CORNERS = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
];

interface Sprite {
  edge: number;
  gain: number;
  glint: number;
  harmonic: number;
  kind: number;
  lightTint: number;
  phase: number;
  quad: number;
  radius: number;
  rim: number;
  riseLoops: number;
  tint: Rgb;
  twinkle: number;
  twinklePhase: number;
  wobbleX: number;
  wobbleY: number;
  x: number;
  y: number;
}

interface Bubble {
  colour: Rgb;
  edge: number;
  floats: boolean;
  gain: number;
  radius: number;
  riseLoops: number;
  x: number;
  y: number;
}

const within = (range: Range, fraction: number) => range.min + (range.max - range.min) * fraction;

const createSprites = (look: StageLook) => {
  const sprites: Sprite[] = [];
  const palette = look.palette.map(srgbColour);
  const random = seededRandom(SPRITE_SEED);
  const addBubble = ({ x, y, radius, colour, gain, edge, riseLoops, floats }: Bubble) => {
    const wobble = (6 + Math.sqrt(radius) * 3.2) * LAYER_PIXEL * look.drift;
    // The random number is taken even when the bubble floats, so that maxGain does not shift the other bubbles.
    const riseStart = riseLoops ? random() : 0;
    const rises = Boolean(riseLoops) && !floats;
    const rim = 0.18 + 0.12 * random();
    const harmonic = Math.round((5 + Math.floor(random() * 8)) * look.drift);
    const phase = random() * TAU;
    const twinkle = 3 + Math.floor(random() * 6);
    const twinklePhase = random() * TAU;
    sprites.push({
      x: x * LAYER_PIXEL,
      y: rises ? riseStart : 1 - y * LAYER_PIXEL,
      radius,
      quad: 1.4,
      edge,
      rim,
      kind: BUBBLE,
      glint: 0,
      wobbleX: wobble,
      wobbleY: wobble * 0.8,
      harmonic,
      phase,
      riseLoops: rises ? riseLoops : 0,
      gain,
      twinkle,
      twinklePhase,
      tint: colour,
      lightTint: look.bubbleLightTint,
    });
  };

  const { loops } = look.rising;
  for (const bubble of look.bubbles) {
    const riseLoops = random() < look.rising.share ? loops.min + Math.floor(random() * (loops.max - loops.min + 1)) : 0;
    const floats = bubble.gain > look.rising.maxGain;
    addBubble({ ...bubble, colour: palette[bubble.palette], riseLoops, floats });
  }

  const extra = look.extraBubbles;
  const extraRandom = seededRandom(extra.seed);
  for (let index = 0; index < extra.count; index++) {
    const x = within(extra.x, extraRandom());
    const y = within(extra.y, extraRandom());
    const radius = within(extra.radius, extraRandom());
    const gain = within(extra.gain, extraRandom());
    const riseLoops = extraRandom() < 0.6 ? 3 + Math.floor(extraRandom() * 4) : 0;
    const floats = gain > look.rising.maxGain;
    const colour = palette[Math.floor(extraRandom() * palette.length)];
    const edge = 0.16 + extraRandom() * 0.1;
    addBubble({ x, y, radius, colour, gain, edge, riseLoops, floats });
  }

  const { sparkles } = look;
  const sparkleRandom = seededRandom(sparkles.seed);
  for (let index = 0; index < sparkles.count; index++) {
    const glints = sparkleRandom() < sparkles.glintShare;
    const x = within(sparkles.x, sparkleRandom()) * LAYER_PIXEL;
    const y = 1 - within(sparkles.y, Math.pow(sparkleRandom(), 1.3)) * LAYER_PIXEL;
    const radius = glints ? 7 + sparkleRandom() * 5 : within(sparkles.size, sparkleRandom());
    const wobbleX = (3 + sparkleRandom() * 8) * LAYER_PIXEL;
    const wobbleY = (3 + sparkleRandom() * 8) * LAYER_PIXEL;
    const harmonic = 8 + Math.floor(sparkleRandom() * 10);
    const phase = sparkleRandom() * TAU;
    const gain = glints ? 1 : within(sparkles.gain, sparkleRandom());
    const twinkle = 5 + Math.floor(sparkleRandom() * 14);
    const twinklePhase = sparkleRandom() * TAU;
    sprites.push({
      x,
      y,
      radius,
      quad: glints ? 1 : 2.2,
      edge: 1,
      rim: 0,
      kind: SPARKLE,
      glint: glints ? 0.55 : 0,
      wobbleX,
      wobbleY,
      harmonic,
      phase,
      riseLoops: 0,
      gain,
      twinkle,
      twinklePhase,
      tint: SPARKLE_TINT,
      lightTint: sparkles.lightTint,
    });
  }
  return sprites;
};

export const createSpriteVertices = (look: StageLook) => {
  const sprites = createSprites(look);
  const vertices = new Float32Array(sprites.length * QUAD_CORNERS.length * SPRITE_FLOATS);
  let offset = 0;
  for (const sprite of sprites) {
    const aSprite = [sprite.x, sprite.y, sprite.radius, sprite.quad];
    const aLook = [sprite.edge, sprite.rim, sprite.kind, sprite.glint];
    const aMotion = [sprite.wobbleX, sprite.wobbleY, sprite.harmonic, sprite.phase];
    const aShine = [sprite.riseLoops, sprite.gain, sprite.twinkle, sprite.twinklePhase];
    const aTint = [...sprite.tint, sprite.lightTint];
    for (const corner of QUAD_CORNERS) {
      vertices.set([corner.x, corner.y, ...aSprite, ...aLook, ...aMotion, ...aShine, ...aTint], offset);
      offset += SPRITE_FLOATS;
    }
  }
  return vertices;
};
