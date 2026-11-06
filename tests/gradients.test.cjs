const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { DEFAULT_CUSTOM_GRADIENT, gradientBackground, gradientMidpoint, normalizeGradient } = loadTypeScript(
  "launcher/src/backgrounds/gradients.ts",
);

test("gradient colours and direction normalize without accepting CSS or external resources", () => {
  assert.deepEqual(normalizeGradient({ start: "#AABBCC", end: "#001122", angle: -90 }), {
    start: "#aabbcc",
    end: "#001122",
    angle: 270,
  });
  for (const value of [
    null,
    12,
    [],
    "linear-gradient(red, blue)",
    { start: "url(https://example.com)", end: "red", angle: Infinity },
  ]) {
    assert.deepEqual(normalizeGradient(value), DEFAULT_CUSTOM_GRADIENT);
  }
  assert.equal(
    gradientBackground({ start: "#ffffff", end: "#000000", angle: 90 }),
    "linear-gradient(90deg, #ffffff, #000000)",
  );
  assert.equal(gradientMidpoint({ start: "#ffffff", end: "#000000", angle: 90 }), "#808080");
});
