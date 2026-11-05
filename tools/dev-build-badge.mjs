import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

// Five-bit rows for a 5×7 hex font. No system font or renderer is needed.
const glyphs = {
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 6, 8, 16, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 16, 30, 1, 1, 30],
  6: [14, 16, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 1, 14],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [15, 16, 16, 16, 16, 16, 15],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
};

function badgeIcon(source, id) {
  const { width, height, data } = PNG.sync.read(source);
  const unit = Math.floor(Math.min(width, height) / 72);
  const textWidth = (id.length * 6 - 1) * unit;
  const x = Math.floor((width - textWidth) / 2);
  const y = height - 16 * unit;

  function fill(left, top, w, h, rgba) {
    for (let row = top; row < top + h; row += 1) {
      for (let col = left; col < left + w; col += 1) {
        data.writeUInt32BE(rgba, (row * width + col) * 4);
      }
    }
  }

  fill(x - 2 * unit, y - 2 * unit, textWidth + 4 * unit, 11 * unit, 0xffbc59ff);
  [...id].forEach((character, index) => {
    glyphs[character].forEach((bits, row) => {
      for (let col = 0; col < 5; col += 1) {
        if (bits & (16 >> col)) {
          fill(x + (index * 6 + col) * unit, y + row * unit, unit, unit, 0x151820ff);
        }
      }
    });
  });
  return PNG.sync.write({ width, height, data });
}

export async function markDevBuild(output, buildId) {
  const id = buildId.slice(0, 8).toUpperCase();
  const configPath = path.join(output, "config.xml");
  const iconPath = path.join(output, "icon.png");
  const config = await readFile(configPath, "utf8");
  const nameTag = /<name>([^<]+)<\/name>/;
  const name = config.match(nameTag)?.[1];
  if (!name) throw new Error("Launcher config.xml is missing its app name.");
  const label = `${name} Dev ${id}`;

  // Stamp the content ID after hashing the runtime so the badge does not hash itself.
  await writeFile(iconPath, badgeIcon(await readFile(iconPath), id));
  await writeFile(
    configPath,
    config.replace(nameTag, () => `<name>${label}</name>`),
  );
  return label;
}
