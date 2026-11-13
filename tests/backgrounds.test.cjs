const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createBackgrounds } = loadTypeScript("launcher/src/backgrounds/createBackgrounds.ts");
const { preview, SCENES } = loadTypeScript("launcher/src/backgrounds/scenes.ts");
const { needsWebGL } = loadTypeScript("launcher/src/contracts/backgrounds.ts");

const NEW_GRADIENTS = ["prism", "pastel", "afterglow", "twilightpeaks", "borealis"];
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

const setup = (previous) => {
  const calls = [];
  const controller = createBackgrounds({
    previous,
    renderState: (state) => calls.push(state && [state.current?.id ?? null, state.speed, state.suspended]),
  });
  return { ...controller, calls };
};

test("scene changes and speed changes render the requested background", () => {
  const { bridge, getState, calls, dispose } = setup();
  bridge.apply("waves");
  assert.equal(getState().suspended, false);
  bridge.setSpeed(1);
  bridge.apply("black", 2);
  bridge.setSpeed(2);
  assert.equal(getState().current.base, "#000000");
  dispose();
  assert.deepEqual(calls, [[null, 1, false], ["waves", 1, false], ["black", 2, false], null]);
});

test("hot replacement preserves suspension and restores the saved scene at the new speed", () => {
  const original = setup();
  original.bridge.apply("snow");
  original.bridge.suspend();
  original.bridge.setSpeed(3);
  const suspended = setup(original.getState());
  assert.equal(suspended.getState().suspended, true);
  assert.deepEqual(suspended.calls, [["snow", 3, true]]);
  suspended.bridge.apply("snow");
  assert.equal(suspended.getState().suspended, false);
  assert.deepEqual(suspended.calls, [
    ["snow", 3, true],
    ["snow", 3, false],
  ]);
});

test("custom colours are validated and survive speed changes without replacing saved scene IDs", () => {
  const { bridge, getState } = setup();
  bridge.apply("custom", 1, "#FFF0CF");
  assert.equal(getState().current.base, "#fff0cf");
  bridge.setSpeed(2);
  assert.equal(getState().current.base, "#fff0cf");
  bridge.suspend();
  assert.equal(getState().suspended, true);
  bridge.apply("custom", 1, "url(https://example.com)");
  assert.equal(getState().current.base, "#7c5cff");
  bridge.apply("black");
  assert.equal(getState().current.base, "#000000");
  assert.equal(getState().suspended, false);
});

test("custom gradients retain both colours and their direction on speed changes", () => {
  const { bridge, getState } = setup();
  bridge.apply("custom-gradient", 1, undefined, { start: "#336699", end: "#ff0000", angle: 90 });
  assert.equal(getState().current.base, "linear-gradient(90deg, #336699, #ff0000)");
  bridge.setSpeed(2);
  assert.equal(getState().current.base, "linear-gradient(90deg, #336699, #ff0000)");
  assert.deepEqual(getState().current.gradient, { start: "#336699", end: "#ff0000", angle: 90 });
});

test("the new gradient backgrounds are static and pure CSS, with no imagery", () => {
  for (const id of NEW_GRADIENTS) {
    const scene = SCENES.find((candidate) => candidate.id === id);
    assert.ok(scene, `${id} is listed`);
    assert.equal(scene.anim, undefined, `${id} is static`);
    assert.equal(scene.category, undefined, `${id} is listed with the gradients`);
    assertPureCss(scene.base, id);
  }
});

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
