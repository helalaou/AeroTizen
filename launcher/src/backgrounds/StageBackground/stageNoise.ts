export const NOISE_SIZE = 256;
const NOISE_SEED = 20261106;

export const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
};

// R and G hold haze at two scales, B and A white noise for the grain and the dither: the scene shader reads them by
// channel.
export const noiseTexels = (size: number) => {
  let state = NOISE_SEED;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const mask = size - 1;
  const count = size * size;

  const blurRows = (source: Float32Array, target: Float32Array, radius: number) => {
    const output = target;
    const inverse = 1 / (2 * radius + 1);
    for (let row = 0; row < count; row += size) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += source[row + (k & mask)];
      }
      for (let x = 0; x < size; x++) {
        output[row + x] = sum * inverse;
        sum += source[row + ((x + radius + 1) & mask)] - source[row + ((x - radius) & mask)];
      }
    }
  };

  const blurColumns = (source: Float32Array, target: Float32Array, radius: number) => {
    const output = target;
    const inverse = 1 / (2 * radius + 1);
    for (let column = 0; column < size; column++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += source[(k & mask) * size + column];
      }
      for (let y = 0; y < size; y++) {
        output[y * size + column] = sum * inverse;
        sum += source[((y + radius + 1) & mask) * size + column] - source[((y - radius) & mask) * size + column];
      }
    }
  };

  const normalised = (values: Float32Array) => {
    let sum = 0;
    for (let index = 0; index < count; index++) {
      sum += values[index] * values[index];
    }
    const k = 1 / Math.sqrt(sum / count);
    return values.map((value) => value * k);
  };

  const smooth = (radius: number) => {
    const a = new Float32Array(count);
    const b = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      a[index] = random() - 0.5;
    }
    for (let pass = 0; pass < 3; pass++) {
      blurRows(a, b, radius);
      blurColumns(b, a, radius);
    }
    return normalised(a);
  };

  const texels = new Uint8Array(count * 4);
  const store = (channel: number, values: Float32Array) => {
    const scaled = normalised(values);
    for (let index = 0; index < count; index++) {
      texels[index * 4 + channel] = Math.max(0, Math.min(255, Math.round((0.5 + 0.18 * scaled[index]) * 255)));
    }
  };

  const coarse = smooth(20);
  const detail = smooth(7);
  store(
    0,
    coarse.map((value, index) => value + 0.5 * detail[index]),
  );
  store(1, smooth(6));
  for (let index = 0; index < count; index++) {
    texels[index * 4 + 2] = Math.floor(random() * 256);
    texels[index * 4 + 3] = Math.floor(random() * 256);
  }
  return texels;
};
