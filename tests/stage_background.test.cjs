const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { preview, SCENES } = loadTypeScript("launcher/src/backgrounds/scenes.ts");
const { needsWebGL } = loadTypeScript("launcher/src/contracts/backgrounds.ts");

const GRADIENT_LAYER = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/;
const COLOUR_LAYER = /^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i;

const backgroundLayers = (value) => {
  const layers = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
};

const assertPureCss = (value, label) => {
  assert.doesNotMatch(value, /url\(|image-set\(|image\(/i, `${label} uses an image`);
  for (const layer of backgroundLayers(value)) {
    assert.ok(GRADIENT_LAYER.test(layer) || COLOUR_LAYER.test(layer), `${label} has a non-gradient layer: ${layer}`);
  }
};

test("Stage is an animated WebGL background with a pure CSS fallback and a still swatch", () => {
  const stage = SCENES.find((scene) => scene.id === "stage");
  assert.ok(stage, "Stage is listed");
  assert.equal(stage.anim, "stage");
  assert.equal(needsWebGL(stage), true);
  assertPureCss(stage.base, "Stage fallback");
  const swatch = preview(stage);
  assert.notEqual(swatch, stage.base, "the swatch shows a still frame, not only the fallback");
  assertPureCss(swatch, "Stage swatch");
});
