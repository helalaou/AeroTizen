const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createBackgrounds } = loadTypeScript("launcher/src/backgrounds/createBackgrounds.ts");

const setup = (previous) => {
  const calls = [];
  const layer = {
    hidden: false,
    ownerDocument: { documentElement: { style: {} }, body: { style: {} } },
  };
  const controller = createBackgrounds({
    layer,
    previous,
    renderScene: (scene, speed) => calls.push([scene?.id ?? null, speed]),
  });
  return { ...controller, layer, calls };
};

test("scene changes and speed changes render the requested background", () => {
  const { bridge, layer, calls, dispose } = setup();
  bridge.apply("waves");
  assert.equal(layer.hidden, false);
  bridge.setSpeed(1);
  bridge.apply("black", 2);
  bridge.setSpeed(2);
  assert.equal(layer.ownerDocument.documentElement.style.background, "#000");
  assert.equal(layer.ownerDocument.body.style.background, "transparent");
  dispose();
  assert.deepEqual(calls, [
    ["waves", 1],
    ["black", 2],
    [null, 2],
  ]);
});

test("hot replacement preserves suspension and restores the saved scene at the new speed", () => {
  const original = setup();
  original.bridge.apply("snow");
  original.bridge.suspend();
  original.bridge.setSpeed(3);
  const suspended = setup(original.getState());
  assert.equal(suspended.layer.hidden, true);
  assert.deepEqual(suspended.calls, []);
  suspended.bridge.apply("snow");
  assert.equal(suspended.layer.hidden, false);
  assert.deepEqual(suspended.calls, [["snow", 3]]);
});
