import { TAU } from "./stageGeometry";

// Dots sit on a square lattice turned about 30 degrees. Its vectors (7, -4) and (4, 7), scaled by 54/65, repeat exactly
// every 54 px on both axes, so one small tile covers the 1080p layer pixel for pixel.
export const HALFTONE_TILE = 54;
const LATTICE_ALONG = 7;
const LATTICE_ACROSS = 4;
const LATTICE_SQUARED_LENGTH = LATTICE_ALONG * LATTICE_ALONG + LATTICE_ACROSS * LATTICE_ACROSS;
const LATTICE_FIRST_STEP = -8;
const LATTICE_LAST_STEP = 16;
const DOT_RADIUS = 0.5;
const GAP_COLOUR = "rgba(4,5,14,0.42)";

export const createHalftoneTile = (document: Document, scale: number) => {
  const size = Math.round(HALFTONE_TILE * scale);
  const unit = size / LATTICE_SQUARED_LENGTH;
  const radius = DOT_RADIUS * unit * Math.sqrt(LATTICE_SQUARED_LENGTH);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  try {
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.fillStyle = GAP_COLOUR;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "#000";
    for (let m = LATTICE_FIRST_STEP; m <= LATTICE_LAST_STEP; m++) {
      for (let n = LATTICE_FIRST_STEP; n <= LATTICE_LAST_STEP; n++) {
        const x = (LATTICE_ALONG * m + LATTICE_ACROSS * n) * unit;
        const y = (LATTICE_ALONG * n - LATTICE_ACROSS * m) * unit;
        const dotTouchesTile = x > -radius && x < size + radius && y > -radius && y < size + radius;
        if (dotTouchesTile) {
          context.beginPath();
          context.arc(x, y, radius, 0, TAU);
          context.fill();
        }
      }
    }
    return canvas.toDataURL();
  } catch {
    return null;
  }
};
