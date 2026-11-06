const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { clampHorizontalOffset, revealHorizontalItem } = loadTypeScript("launcher/src/home/state/horizontalScroll.ts");

test("horizontal rows clamp stale offsets after shortening, including a row smaller than its viewport", () => {
  assert.equal(clampHorizontalOffset(900, 1000, 1400), 400);
  assert.equal(clampHorizontalOffset(900, 1000, 700), 0);
  assert.equal(clampHorizontalOffset(-20, 1000, 1400), 0);
});

test("the same reveal calculation keeps a selected item visible in either writing direction", () => {
  const track = { clientWidth: 1000, scrollWidth: 2200 };
  for (const rtl of [false, true]) {
    const item = (start) => ({ offsetLeft: rtl ? 1000 - start - 300 : start, offsetWidth: 300 });
    assert.equal(revealHorizontalItem(track, item(600), 0, rtl), 0);
    assert.equal(revealHorizontalItem(track, item(1200), 0, rtl), 500);
    assert.equal(revealHorizontalItem(track, item(200), 500, rtl), 200);
    assert.equal(revealHorizontalItem(track, item(1900), 500, rtl), 1200);
  }
});
