import type { ParticleKind } from "../contracts/backgrounds";

export const W = 1920;
export const H = 1080;

export interface RainStreak {
  readonly length: number;
  readonly opacity: number;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

interface Particle {
  d: number;
  ph: number;
  size: number;
  streak?: RainStreak;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

// Pre-rendered soft sprites: one radial gradient drawn once, stamped many times. Crisper
// and much cheaper than drawing glows per particle per frame.
function sprite(document: Document, size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) {
    throw new Error("Sprite canvas context is unavailable");
  }
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

// ~30 fps animation loop; `step(dt)` gets elapsed time in 1/30 s units, scaled by speed.
export const runParticleLoop = (document: Document, speed: number, step: (dt: number) => void) => {
  let last = 0;
  const raf =
    window.requestAnimationFrame || ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 33));
  let alive = true;
  function frame(now: number) {
    if (!alive) {
      return;
    }
    if (!document.hidden && now - last >= 32) {
      step(Math.min(3, (now - (last || now - 33)) / 33.3) * speed);
      last = now;
    }
    raf(frame);
  }
  raf(frame);
  return () => {
    alive = false;
  };
};

export const createStarGlow = (document: Document) =>
  sprite(document, 32, [
    [0, "rgba(255,255,255,1)"],
    [0.12, "rgba(235,242,255,.9)"],
    [0.35, "rgba(170,200,255,.25)"],
    [1, "rgba(170,200,255,0)"],
  ]);

export const createStars = (dense: boolean) => {
  const stars: { x: number; y: number; size: number; v: number; p: number; tw: number }[] = [];
  const n = dense ? 210 : 90;
  for (let i = 0; i < n; i++) {
    const depth = Math.random();
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 6 + depth * depth * 22,
      v: 0.15 + depth * 1.6,
      p: Math.random() * 6.28,
      tw: 0.6 + Math.random() * 1.6,
    });
  }
  const advance = (dt: number) => {
    for (const star of stars) {
      star.x -= star.v * dt;
      if (star.x < -20) {
        star.x = W + 20;
        star.y = Math.random() * H;
      }
    }
  };
  return { sprites: stars, advance };
};

export const createParticleGlow = (document: Document, kind: Exclude<ParticleKind, "rain">) => {
  if (kind === "snow") {
    return sprite(document, 64, [
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,255,255,.85)"],
      [0.6, "rgba(255,255,255,.18)"],
      [1, "rgba(255,255,255,0)"],
    ]);
  }
  return sprite(document, 96, [
    [0, "rgba(255,255,220,1)"],
    [0.08, "rgba(235,255,140,.95)"],
    [0.3, "rgba(200,255,80,.35)"],
    [1, "rgba(180,255,60,0)"],
  ]);
};

// Rain falls in streaks. Snow drifts with depth and fireflies wander.
export const createParticles = (kind: ParticleKind) => {
  const ps: Particle[] = [];
  const n = kind === "fireflies" ? 70 : 130;
  function spawn(index: number, fromTop: boolean) {
    if (!ps[index]) {
      ps[index] = { d: 0, x: 0, y: 0, size: 0, vy: 0, vx: 0, ph: 0 };
    }
    const p = ps[index];
    p.d = Math.random();
    p.x = Math.random() * W;
    p.y = fromTop ? -40 : Math.random() * H;
    if (kind === "snow") {
      p.size = 6 + p.d * p.d * 28;
      p.vy = 0.8 + p.d * 2.6;
      p.vx = (Math.random() - 0.5) * 0.6;
    } else if (kind === "rain") {
      const height = 18 + p.d * 38;
      p.vy = 18 + p.d * 16;
      p.vx = -2.5 - p.d * 2;
      const width = 0.8 + p.d * 1.4;
      const dx = -(p.vx * height) / p.vy;
      const length = Math.sqrt(dx * dx + height * height);
      p.streak = {
        length,
        opacity: Number((0.18 + p.d * 0.4).toFixed(2)),
        radius: width / 2,
        x: dx / length,
        y: -height / length,
      };
    } else {
      p.size = 40 + p.d * 50;
      p.vx = (Math.random() - 0.5) * 0.8;
      p.vy = (Math.random() - 0.5) * 0.8;
    }
    p.ph = Math.random() * 6.28;
  }
  for (let i = 0; i < n; i++) {
    spawn(i, false);
  }
  const advance = (dt: number, t: number) => {
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (kind === "fireflies") {
        p.vx += (Math.random() - 0.5) * 0.15;
        p.vy += (Math.random() - 0.5) * 0.15;
        p.vx *= 0.97;
        p.vy *= 0.97;
      }
      p.x += (p.vx + (kind === "snow" ? Math.sin(t * 1.5 + p.ph) * 0.6 : 0)) * dt;
      p.y += p.vy * dt;
      if (p.y > H + 60 || p.x < -80 || p.x > W + 80 || (kind === "fireflies" && p.y < -80)) {
        spawn(i, kind !== "fireflies");
      }
    }
  };
  return { sprites: ps, advance };
};
