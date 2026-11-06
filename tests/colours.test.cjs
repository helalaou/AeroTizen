const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { channelsToColour, colourToChannels, isLightColour } = loadTypeScript("launcher/src/backgrounds/colours.ts");
const { adjustColourChannel, colourChannelValue } = loadTypeScript("launcher/src/settings/state/colourPicker.ts");

test("the picker reaches primary colours, greys, black and white without losing saved RGB precision", () => {
  assert.equal(channelsToColour({ hue: 0, strength: 100, lightness: 50 }), "#ff0000");
  assert.equal(channelsToColour({ hue: 120, strength: 100, lightness: 50 }), "#00ff00");
  assert.equal(channelsToColour({ hue: 240, strength: 100, lightness: 50 }), "#0000ff");
  for (const hex of ["#000000", "#ffffff", "#808080", "#7c5cff", "#fff0cf", "#00c4d4", "#795548", "#012345"]) {
    assert.equal(channelsToColour(colourToChannels(hex)), hex);
  }
  assert.equal(isLightColour("#ffffff"), true);
  assert.equal(isLightColour("#ffdf36"), true);
  assert.equal(isLightColour("#000000"), false);
  assert.equal(isLightColour("#15264a"), false);
});

test("remote adjustments clamp strength and lightness, wrap hue, and preserve the other channels", () => {
  const start = { hue: 0, strength: 0, lightness: 100 };
  assert.deepEqual(adjustColourChannel(start, "hue", -1), { ...start, hue: 359 });
  assert.deepEqual(adjustColourChannel(start, "strength", -1), start);
  assert.deepEqual(adjustColourChannel(start, "lightness", 1), start);
  assert.deepEqual(adjustColourChannel(start, "strength", 1), { ...start, strength: 1 });
});

test("one-degree remote presses reach every hue", () => {
  let colour = { hue: 0, strength: 100, lightness: 50 };
  const visited = new Set();
  for (let press = 0; press < 360; press++) {
    visited.add(colour.hue);
    colour = adjustColourChannel(colour, "hue", 1);
  }
  assert.equal(visited.size, 360);
  assert.equal(colour.hue, 0);
});

test("a saved colour next to red keeps its RGB precision and shows hue zero within the slider range", () => {
  const colour = colourToChannels("#ff0001");
  assert.equal(channelsToColour(colour), "#ff0001");
  assert.equal(colourChannelValue(colour, "hue"), 0);
  assert.equal(adjustColourChannel(colour, "hue", 1).hue, 1);
  assert.equal(adjustColourChannel(colour, "hue", -1).hue, 359);
});
