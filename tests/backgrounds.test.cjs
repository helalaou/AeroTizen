const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const setup = () => {
  const calls = [];
  const layer = {
    hidden: true,
    set textContent(value) {
      assert.equal(value, "");
      calls.push("clear");
    },
  };
  const context = {
    window: {},
    document: {
      documentElement: { style: {} },
      body: { style: {} },
      getElementById(id) {
        assert.equal(id, "bg");
        return layer;
      },
      createElement() {
        throw new Error("Wave markup belongs to the registered view");
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../launcher/js/backgrounds.js"), "utf8"), context);
  const renderer = (name) => (mount, speed) => {
    assert.equal(mount, layer);
    calls.push([name, speed]);
    return () => calls.push("dispose " + name);
  };
  return { backgrounds: context.window.Backgrounds, layer, calls, renderer };
};

test("wave speed and scene changes release the view before clearing its mount", () => {
  const { backgrounds, layer, calls, renderer } = setup();
  const unregister = backgrounds.registerWaveRenderer(renderer("waves"));
  backgrounds.apply("waves");
  assert.equal(layer.hidden, false);
  assert.deepEqual(calls.splice(0), ["clear", ["waves", 1]]);
  backgrounds.setSpeed(2);
  assert.deepEqual(calls.splice(0), ["dispose waves", "clear", ["waves", 2]]);
  backgrounds.apply("black");
  assert.deepEqual(calls.splice(0), ["dispose waves", "clear"]);
  unregister();
  unregister();
  assert.deepEqual(calls, []);
});

test("renderer replacement restores selected waves but never revives a suspended background", () => {
  const { backgrounds, layer, calls, renderer } = setup();
  backgrounds.apply("waves");
  calls.length = 0;
  const old = backgrounds.registerWaveRenderer(renderer("old"));
  const current = backgrounds.registerWaveRenderer(renderer("current"));
  old();
  assert.deepEqual(calls.splice(0), [["old", 1], "dispose old", ["current", 1]]);
  backgrounds.hide();
  assert.equal(layer.hidden, true);
  current();
  const replacement = backgrounds.registerWaveRenderer(renderer("replacement"));
  assert.equal(layer.hidden, true, "hot replacement keeps the native input layer hidden");
  assert.deepEqual(calls.splice(0), ["dispose current", ["replacement", 1]]);
  backgrounds.suspend();
  backgrounds.setSpeed(3);
  replacement();
  const reused = renderer("last");
  const last = backgrounds.registerWaveRenderer(reused);
  assert.deepEqual(calls.splice(0), ["dispose replacement", "clear"]);
  assert.equal(layer.hidden, true);
  backgrounds.apply("waves");
  assert.deepEqual(calls.splice(0), ["clear", ["last", 3]]);
  const next = backgrounds.registerWaveRenderer(reused);
  assert.deepEqual(calls.splice(0), ["dispose last", ["last", 3]]);
  last();
  assert.deepEqual(calls, [], "stale cleanup cannot release a new registration of the same renderer");
  next();
  assert.deepEqual(calls, ["dispose last"]);
});
