const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createBackgrounds } = loadTypeScript("launcher/src/backgrounds/createBackgrounds.ts");

const setup = (previous) => {
  const calls = [];
  const layer = {
    hidden: false,
    ownerDocument: {
      documentElement: {
        style: {},
        setAttribute(name, value) {
          this[name] = value;
        },
      },
      body: { style: {} },
    },
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
  assert.equal(layer.ownerDocument.documentElement.style.background, "#000000");
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

test("custom colours are validated and survive speed changes without replacing saved scene IDs", () => {
  const { bridge, layer } = setup();
  const root = layer.ownerDocument.documentElement;
  bridge.apply("custom", 1, "#FFF0CF");
  assert.equal(root.style.background, "#fff0cf");
  assert.equal(root["data-light-background"], "true");
  bridge.setSpeed(2);
  assert.equal(root.style.background, "#fff0cf");
  bridge.suspend();
  assert.equal(root["data-light-background"], "false");
  bridge.apply("custom", 1, "url(https://example.com)");
  assert.equal(root.style.background, "#7c5cff");
  bridge.apply("black");
  assert.equal(root.style.background, "#000000");
  assert.equal(root["data-light-background"], "false");
});

test("custom gradients render, retain both colours on speed changes, and select light-background contrast", () => {
  const { bridge, layer } = setup();
  const root = layer.ownerDocument.documentElement;
  bridge.apply("custom-gradient", 1, undefined, { start: "#336699", end: "#ff0000", angle: 90 });
  assert.equal(root.style.background, "linear-gradient(90deg, #336699, #ff0000)");
  bridge.setSpeed(2);
  assert.equal(root.style.background, "linear-gradient(90deg, #336699, #ff0000)");
  bridge.apply("custom-gradient", 1, undefined, { start: "#ffffff", end: "#fff0cf", angle: 0 });
  assert.equal(root["data-light-background"], "true");
  bridge.apply("black");
  assert.equal(root["data-light-background"], "false");
});
