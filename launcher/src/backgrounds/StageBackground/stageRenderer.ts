import { compileShader, getWebGL } from "../webgl";

import { createStageClock } from "./stageClock";
import { STAGE_HEIGHT, STAGE_WIDTH, TAU } from "./stageGeometry";
import type { StageLook } from "./stageLook";
import { srgbToLinear, STAGE_LOOK } from "./stageLook";
import { NOISE_SIZE, noiseTexels, seededRandom } from "./stageNoise";
import {
  SCENE_ATTRIBUTES,
  SCENE_VERTEX,
  sceneFragment,
  SPRITE_ATTRIBUTES,
  SPRITE_FRAGMENT,
  spriteVertex,
} from "./stageShaders";
import { createSpriteVertices, SPRITE_FLOATS } from "./stageSprites";

// Sprite motion repeats a whole number of times per loop, so wrapping the loop phase is seamless.
const DRIFT_LOOP_SECONDS = 240;
const TWINKLE_LOOP_SECONDS = 60;
const BEAT_HZ = 0.5;
const GRAIN_UNDER_HALFTONE = 0.5;
const GRAIN_SEED = 424242;
const BYTES_PER_FLOAT = 4;
const CORNER_FLOATS = 2;
const ATTRIBUTE_FLOATS = 4;

const fract = (x: number) => x - Math.floor(x);

const beat = (t: number) => {
  const phase = fract(t * BEAT_HZ);
  const attack = Math.min(phase / 0.18, 1);
  return attack * attack * (3 - 2 * attack) * Math.exp(-3 * phase);
};

const swell = (t: number, period: number) => {
  const s = 0.5 + 0.5 * Math.cos((TAU * (t - period * 0.6)) / period);
  return s * s * s * s;
};

let cachedTexels: Uint8Array | null = null;
let cachedSpriteVertices: Float32Array | null = null;

function linkProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
  attributes: readonly string[],
) {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (program && vertex && fragment) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    attributes.forEach((name, index) => gl.bindAttribLocation(program, index, name));
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!program || !vertex || !fragment || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createTexture(
  gl: WebGLRenderingContext,
  unit: number,
  size: { height: number; width: number },
  data: Uint8Array | null,
  wrap: number,
) {
  const texture = gl.createTexture();
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return texture;
}

function createRenderer(gl: WebGLRenderingContext, look: StageLook) {
  const beamCount = look.beams.length;
  const scene = linkProgram(gl, SCENE_VERTEX, sceneFragment(look), SCENE_ATTRIBUTES);
  const sprites = linkProgram(gl, spriteVertex(look), SPRITE_FRAGMENT, SPRITE_ATTRIBUTES);
  const triangle = gl.createBuffer();
  const quads = gl.createBuffer();
  cachedSpriteVertices ??= createSpriteVertices(look);
  cachedTexels ??= noiseTexels(NOISE_SIZE);
  const spriteVertexCount = cachedSpriteVertices.length / SPRITE_FLOATS;
  const noise = createTexture(gl, gl.TEXTURE0, { width: NOISE_SIZE, height: NOISE_SIZE }, cachedTexels, gl.REPEAT);
  const spriteLayer = createTexture(
    gl,
    gl.TEXTURE1,
    { width: STAGE_WIDTH, height: STAGE_HEIGHT },
    null,
    gl.CLAMP_TO_EDGE,
  );
  const target = gl.createFramebuffer();
  const release = () => {
    gl.deleteFramebuffer(target);
    gl.deleteTexture(spriteLayer);
    gl.deleteTexture(noise);
    gl.deleteBuffer(triangle);
    gl.deleteBuffer(quads);
    gl.useProgram(null);
    gl.deleteProgram(scene);
    gl.deleteProgram(sprites);
  };
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, spriteLayer, 0);
  const targetReady = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!scene || !sprites || !triangle || !quads || !noise || !spriteLayer || !target || !targetReady) {
    release();
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, quads);
  gl.bufferData(gl.ARRAY_BUFFER, cachedSpriteVertices, gl.STATIC_DRAW);

  const sceneUniforms = {
    beam: gl.getUniformLocation(scene, "uBeam"),
    colour: gl.getUniformLocation(scene, "uColor"),
    haze: gl.getUniformLocation(scene, "uHaze"),
    flow: gl.getUniformLocation(scene, "uFlow"),
    grain: gl.getUniformLocation(scene, "uGrain"),
  };
  const spriteUniforms = {
    beam: gl.getUniformLocation(sprites, "uBeam"),
    colour: gl.getUniformLocation(sprites, "uColor"),
    loop: gl.getUniformLocation(sprites, "uLoop"),
  };
  gl.useProgram(scene);
  gl.uniform1i(gl.getUniformLocation(scene, "uNoise"), 0);
  gl.uniform1i(gl.getUniformLocation(scene, "uSprites"), 1);
  gl.viewport(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  const beamDirections = new Float32Array(Math.ceil(beamCount / 2) * 4);
  const beamColours = new Float32Array(beamCount * 3);
  const colourEnds = look.beams.map((beam) => ({
    from: srgbToLinear(beam.colours.from),
    to: srgbToLinear(beam.colours.to),
  }));
  const grainRandom = seededRandom(GRAIN_SEED);
  const stride = SPRITE_FLOATS * BYTES_PER_FLOAT;
  const cornerBytes = CORNER_FLOATS * BYTES_PER_FLOAT;
  const attributeBytes = ATTRIBUTE_FLOATS * BYTES_PER_FLOAT;

  const aimBeams = (t: number, brightness: number) => {
    look.beams.forEach((beam, index) => {
      const angle = beam.sway.reduce(
        (sum, { amplitude, seconds, phase }) => sum + amplitude * Math.sin((TAU * t) / seconds + phase),
        beam.restAngle,
      );
      beamDirections[index * 2] = Math.cos(angle);
      beamDirections[index * 2 + 1] = Math.sin(angle);
      const mix = 0.5 - 0.5 * Math.cos((TAU * t) / beam.colours.cycleSeconds + beam.colours.phase);
      const { from, to } = colourEnds[index];
      for (let channel = 0; channel < 3; channel++) {
        beamColours[index * 3 + channel] =
          (from[channel] + (to[channel] - from[channel]) * mix) * beam.gain * brightness;
      }
    });
  };

  const drawSprites = (t: number, pulse: number, chorus: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(sprites);
    gl.uniform4fv(spriteUniforms.beam, beamDirections);
    gl.uniform3fv(spriteUniforms.colour, beamColours);
    gl.uniform4f(
      spriteUniforms.loop,
      TAU * fract(t / DRIFT_LOOP_SECONDS),
      TAU * fract(t / TWINKLE_LOOP_SECONDS),
      pulse,
      chorus,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, quads);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, CORNER_FLOATS, gl.FLOAT, false, stride, 0);
    for (let attribute = 1; attribute < SPRITE_ATTRIBUTES.length; attribute++) {
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(
        attribute,
        ATTRIBUTE_FLOATS,
        gl.FLOAT,
        false,
        stride,
        cornerBytes + (attribute - 1) * attributeBytes,
      );
    }
    gl.enable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, spriteVertexCount);
    gl.disable(gl.BLEND);
    for (let attribute = 1; attribute < SPRITE_ATTRIBUTES.length; attribute++) {
      gl.disableVertexAttribArray(attribute);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const drawScene = (t: number, pulse: number, chorus: number) => {
    gl.useProgram(scene);
    gl.uniform4fv(sceneUniforms.beam, beamDirections);
    gl.uniform3fv(sceneUniforms.colour, beamColours);
    gl.uniform4f(
      sceneUniforms.haze,
      fract(t * 0.009) - 0.5,
      fract(t * 0.004) - 0.5,
      fract(-t * 0.012) - 0.5,
      fract(t * 0.007) - 0.5,
    );
    gl.uniform4f(sceneUniforms.flow, fract(t * 0.011) - 0.5, fract(-t * 0.008) - 0.5, 1 + 0.1 * pulse, pulse + chorus);
    gl.uniform4f(
      sceneUniforms.grain,
      Math.floor(grainRandom() * 256),
      Math.floor(grainRandom() * 256),
      look.grain * GRAIN_UNDER_HALFTONE,
      0,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.vertexAttribPointer(0, CORNER_FLOATS, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const draw = (t: number) => {
    const pulse = beat(t);
    const chorus = swell(t, look.swell.seconds);
    aimBeams(t, (1 + 0.05 * pulse) * (1 + look.swell.gain * chorus));
    drawSprites(t, pulse, chorus);
    drawScene(t, pulse, chorus);
  };

  return { draw, release };
}

export interface StageAnimation {
  setSpeed(value: number): void;
  stop(): void;
}

export const startStage = (canvas: HTMLCanvasElement): StageAnimation | undefined => {
  const gl = getWebGL(canvas, { alpha: false });
  if (!gl) {
    return undefined;
  }
  const renderer = createRenderer(gl, STAGE_LOOK);
  if (!renderer || gl.getError() !== gl.NO_ERROR || gl.isContextLost()) {
    renderer?.release();
    if (!gl.isContextLost()) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    return undefined;
  }

  const document = canvas.ownerDocument;
  const window = document.defaultView;
  const motion = window?.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const clock = createStageClock();
  let time = 0;
  let frame = 0;
  let stopped = false;
  let speed = 1;

  const running = () => !stopped && speed > 0 && !document.hidden && !gl.isContextLost() && !motion?.matches;
  const draw = (now: number) => {
    frame = 0;
    if (!running()) {
      return;
    }
    frame = window?.requestAnimationFrame(draw) ?? 0;
    const step = clock.tick(now);
    if (step === null) {
      return;
    }
    time += (step / 1000) * speed;
    renderer.draw(time);
  };
  const update = () => {
    if (running() && !frame) {
      clock.reset();
      frame = window?.requestAnimationFrame(draw) ?? 0;
    } else if (!running() && frame) {
      window?.cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  renderer.draw(time);
  document.addEventListener("visibilitychange", update);
  // Chromium 69 uses the original MediaQueryList listener API.
  motion?.addListener(update);
  update();
  return {
    setSpeed(value) {
      speed = value;
      update();
    },
    stop() {
      stopped = true;
      update();
      document.removeEventListener("visibilitychange", update);
      motion?.removeListener(update);
      if (!gl.isContextLost()) {
        renderer.release();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    },
  };
};
