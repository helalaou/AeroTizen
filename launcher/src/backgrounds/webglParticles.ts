import type { RainStreak } from "./particleAnimation";
import {
  createParticleGlow,
  createParticles,
  createStarGlow,
  createStars,
  H,
  runParticleLoop,
  W,
} from "./particleAnimation";

const STAR_ALPHA = "0.35 + 0.65 * abs(sin(u_time * a_style.y + a_style.x))";
const ALPHA_BY_SCENE = {
  stars: STAR_ALPHA,
  nebula: STAR_ALPHA,
  snow: "0.45 + a_style.y * 0.55",
  fireflies: "0.15 + 0.85 * sin(u_time * 0.9 + a_style.x) * sin(u_time * 0.9 + a_style.x)",
};

export type WebGLParticleKind = keyof typeof ALPHA_BY_SCENE | "rain";

const vertexSource = (kind: Exclude<WebGLParticleKind, "rain">) => `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec2 a_style;
uniform vec2 u_viewport;
uniform float u_time;
varying mediump vec2 v_uv;
varying mediump float v_alpha;
void main() {
  vec2 clip = a_position / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_alpha = ${ALPHA_BY_SCENE[kind]};
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_glow;
varying mediump vec2 v_uv;
varying mediump float v_alpha;
void main() {
  gl_FragColor = texture2D(u_glow, v_uv) * v_alpha;
}
`;

const RAIN_VERTEX = `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec3 a_style;
uniform vec2 u_viewport;
varying mediump vec2 v_point;
varying mediump vec3 v_streak;
void main() {
  vec2 clip = a_position / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_point = a_uv;
  v_streak = a_style;
}
`;

const RAIN_FRAGMENT = `
precision mediump float;
varying mediump vec2 v_point;
varying mediump vec3 v_streak;
void main() {
  vec2 offset = v_point - vec2(clamp(v_point.x, 0.0, v_streak.x), 0.0);
  float coverage = clamp(v_streak.y + 0.5 - length(offset), 0.0, 1.0);
  float alpha = v_streak.z * coverage;
  gl_FragColor = vec4(vec3(190.0, 215.0, 255.0) / 255.0 * alpha, alpha);
}
`;

const CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
];
const SPRITE_STRIDE = 6;
const RAIN_STRIDE = 7;

function writeRainQuad(data: Float32Array, offset: number, streak: RainStreak, x: number, y: number) {
  const buffer = data;
  const extent = streak.radius + 1;
  let index = offset;
  for (const corner of CORNERS) {
    const along = corner.x ? streak.length + extent : -extent;
    const across = corner.y ? extent : -extent;
    buffer[index] = x + streak.x * along - streak.y * across;
    buffer[index + 1] = y + streak.y * along + streak.x * across;
    buffer[index + 2] = along;
    buffer[index + 3] = across;
    buffer[index + 4] = streak.length;
    buffer[index + 5] = streak.radius;
    buffer[index + 6] = streak.opacity;
    index += RAIN_STRIDE;
  }
  return index;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function getWebGL(canvas: HTMLCanvasElement) {
  try {
    return canvas.getContext("webgl", {
      antialias: false,
      depth: false,
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    return null;
  }
}

export const probeWebGL = (document: Document) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = getWebGL(canvas);
  if (!gl || gl.isContextLost()) {
    return false;
  }
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
};

export const startWebGLParticles = (canvas: HTMLCanvasElement, kind: WebGLParticleKind, speed: number) => {
  const gl = getWebGL(canvas);
  if (!gl) {
    return;
  }

  const rain = kind === "rain";
  const stride = rain ? RAIN_STRIDE : SPRITE_STRIDE;
  const program = gl.createProgram();
  const vertices = gl.createBuffer();
  const texture = rain ? null : gl.createTexture();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, rain ? RAIN_VERTEX : vertexSource(kind));
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, rain ? RAIN_FRAGMENT : FRAGMENT_SHADER);
  const release = () => {
    gl.deleteBuffer(vertices);
    gl.deleteTexture(texture);
    gl.useProgram(null);
    gl.deleteProgram(program);
    if (!gl.isContextLost()) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
  if (program && vertex && fragment) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!program || !vertices || (!rain && !texture) || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    release();
    return;
  }

  const document = canvas.ownerDocument;
  const isParticle = kind !== "stars" && kind !== "nebula";
  const { sprites, advance } = isParticle ? createParticles(kind) : createStars(kind === "stars");
  const vertexCount = sprites.length * CORNERS.length;
  const data = new Float32Array(vertexCount * stride);
  let offset = 0;
  for (const sprite of sprites) {
    for (const corner of CORNERS) {
      data[offset + 2] = corner.x;
      data[offset + 3] = corner.y;
      if ("tw" in sprite) {
        data[offset + 4] = sprite.p;
        data[offset + 5] = sprite.tw;
      }
      offset += stride;
    }
  }

  gl.useProgram(program);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewport"), W, H);
  const time = gl.getUniformLocation(program, "u_time");
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  for (const { name, index } of [
    { name: "a_position", index: 0 },
    { name: "a_uv", index: 2 },
    { name: "a_style", index: 4 },
  ]) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, rain && index === 4 ? 3 : 2, gl.FLOAT, false, stride * 4, index * 4);
  }

  if (texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      const glow =
        kind === "snow" || kind === "fireflies" ? createParticleGlow(document, kind) : createStarGlow(document);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glow);
    } catch {
      release();
      return;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) {
    release();
    return;
  }

  let t = 0;
  const stop = runParticleLoop(document, speed, (dt) => {
    t += 0.03 * dt;
    advance(dt, t);
    let index = 0;
    for (const sprite of sprites) {
      if ("streak" in sprite && sprite.streak) {
        index = writeRainQuad(data, index, sprite.streak, sprite.x, sprite.y);
        continue;
      }
      const left = sprite.x - sprite.size / 2;
      const top = sprite.y - sprite.size / 2;
      for (const corner of CORNERS) {
        data[index] = left + corner.x * sprite.size;
        data[index + 1] = top + corner.y * sprite.size;
        if ("d" in sprite) {
          data[index + 4] = sprite.ph;
          data[index + 5] = sprite.d;
        }
        index += stride;
      }
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.uniform1f(time, t);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  });
  return () => {
    stop();
    release();
  };
};
