const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createKeyAcceleration } = loadTypeScript("launcher/src/settings/state/createKeyAcceleration.ts");

test("holding ramps up, while release, direction, focus and a pause restore one-step control", () => {
  let time = 0;
  const acceleration = createKeyAcceleration(() => time);
  const step = (at, code = 39, target = "colour:hue") => {
    time = at;
    return acceleration.step(code, target);
  };
  assert.equal(step(0), 1);
  assert.equal(step(500), 1);
  assert.equal(step(600), 5);
  assert.equal(step(1000), 5);
  assert.equal(step(1500), 10);
  acceleration.reset();
  assert.equal(step(1510), 1);
  assert.equal(step(2110), 5);
  assert.equal(step(2120, 37), 1);
  assert.equal(step(2720, 37), 5);
  assert.equal(step(2730, 37, "gradient:angle"), 1);
  assert.equal(step(3330, 37, "gradient:angle"), 5);
  assert.equal(step(4200, 37, "gradient:angle"), 1);
});
