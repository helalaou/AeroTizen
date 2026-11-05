export const FIRE_WIDTH = 192;
export const FIRE_HEIGHT = 108;
const MAX_HEAT = 36;

const PALETTE_STOPS = [
  { level: 0, rgb: [0, 0, 0] },
  { level: 40, rgb: [40, 4, 2] },
  { level: 90, rgb: [140, 24, 4] },
  { level: 140, rgb: [220, 80, 10] },
  { level: 190, rgb: [250, 160, 40] },
  { level: 255, rgb: [255, 236, 170] },
] as const;

const buildPalette = () => {
  const palette = new Uint8ClampedArray(256 * 3);
  let stop = 0;
  for (let level = 0; level < 256; level++) {
    while (level > PALETTE_STOPS[stop + 1].level) {
      stop++;
    }
    const low = PALETTE_STOPS[stop];
    const high = PALETTE_STOPS[stop + 1];
    const blend = (level - low.level) / (high.level - low.level);
    for (let channel = 0; channel < 3; channel++) {
      palette[level * 3 + channel] = low.rgb[channel] + (high.rgb[channel] - low.rgb[channel]) * blend;
    }
  }
  return palette;
};

export const startFireAnimation = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const image = context.createImageData(FIRE_WIDTH, FIRE_HEIGHT);
  const heat = new Uint8Array(FIRE_WIDTH * FIRE_HEIGHT);
  const palette = buildPalette();
  let frame = 0;
  let lastDraw = 0;

  const draw = () => {
    const time = ++frame * 0.02;
    const middle = FIRE_WIDTH / 2;
    // Seed the bottom row with slowly shifting heat sources along the hearth.
    for (let x = 0; x < FIRE_WIDTH; x++) {
      const distance = Math.abs(x - middle) / middle;
      const logs =
        Math.max(0, 1 - distance * 1.35) + 0.25 * Math.sin(x * 0.11 + time) + 0.2 * Math.sin(x * 0.05 - time * 1.7);
      const level = logs > 0.25 ? MAX_HEAT : Math.floor(MAX_HEAT * Math.max(0, logs) * 3);
      heat[(FIRE_HEIGHT - 1) * FIRE_WIDTH + x] = Math.random() < 0.85 ? level : level >> 1;
    }
    // Heat rises, drifts sideways and cools by a random amount.
    for (let x = 0; x < FIRE_WIDTH; x++) {
      for (let y = 1; y < FIRE_HEIGHT; y++) {
        const source = y * FIRE_WIDTH + x;
        const level = heat[source];
        if (level === 0) {
          heat[source - FIRE_WIDTH] = 0;
          continue;
        }
        const drift = Math.floor(Math.random() * 4);
        const destination = source - FIRE_WIDTH - (drift - 1);
        if (destination >= 0) {
          heat[destination] = Math.max(0, level - (drift & 1) - (Math.random() < 0.18 ? 1 : 0));
        }
      }
    }
    const pixels = image.data;
    for (let i = 0; i < heat.length; i++) {
      const color = Math.floor((heat[i] * 255) / MAX_HEAT) * 3;
      pixels[i * 4] = palette[color];
      pixels[i * 4 + 1] = palette[color + 1];
      pixels[i * 4 + 2] = palette[color + 2];
      pixels[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  };
  const animate = (now: number) => {
    if (now - lastDraw > 33) {
      draw();
      lastDraw = now;
    }
    animationFrame = window.requestAnimationFrame(animate);
  };
  let animationFrame = window.requestAnimationFrame(animate);
  return () => window.cancelAnimationFrame(animationFrame);
};
