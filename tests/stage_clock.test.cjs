const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { createStageClock } = loadTypeScript("launcher/src/backgrounds/StageBackground/stageClock.ts");

const drawsPerSecond = (refreshHz, seconds, jitter = [0]) => {
  const clock = createStageClock();
  const counts = Array.from({ length: seconds }, () => 0);
  const period = 1000 / refreshHz;
  for (let index = 0; index * period < seconds * 1000; index += 1) {
    const now = 1000 + index * period + jitter[index % jitter.length];
    if (clock.tick(now) !== null) {
      counts[Math.floor((now - 1000) / 1000)] += 1;
    }
  }
  return counts.filter((_, second) => second < seconds);
};

test("Stage draws about 20 frames a second on a 60 Hz display, even when frame timestamps jitter", () => {
  for (const count of drawsPerSecond(60, 3, [0, 2, -2, 1, -1])) {
    assert.ok(count >= 19 && count <= 21, `${count} frames in a second`);
  }
});

test("Stage keeps about 20 frames a second on a 50 Hz display", () => {
  for (const count of drawsPerSecond(50, 3)) {
    assert.ok(count >= 16 && count <= 26, `${count} frames in a second`);
  }
});

test("the animation advances by the time between drawn frames, and never jumps after a pause", () => {
  const clock = createStageClock();
  assert.equal(clock.tick(1000), 0, "the first frame starts the animation where it is");
  assert.equal(clock.tick(1016), null, "too soon after the last frame");
  assert.equal(clock.tick(1050), 50);
  assert.equal(clock.tick(9000), 100, "a long pause advances by at most 100 ms");
  clock.reset();
  assert.equal(clock.tick(20000), 0, "after a reset the next frame starts again without a jump");
});
