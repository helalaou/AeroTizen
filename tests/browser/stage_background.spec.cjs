const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");

const PAUSE_CHECK_MS = 200;
const SPEED_STEPS = 6;

test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({ background: "stage", speed: 1, showWeather: false, weatherPhoto: false }),
    );
    window.stageAudit = { compiles: 0, draws: 0 };
    for (const [method, counter] of [
      ["compileShader", "compiles"],
      ["drawArrays", "draws"],
    ]) {
      const original = WebGLRenderingContext.prototype[method];
      WebGLRenderingContext.prototype[method] = function (...args) {
        if (this.canvas.parentElement?.hasAttribute("data-stage-background")) {
          window.stageAudit[counter]++;
        }
        return original.apply(this, args);
      };
    }
  });
});

const openStage = async (page) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await expect(page.locator("[data-stage-background] canvas")).toHaveCount(1);
};

const draws = (page) => page.evaluate(() => window.stageAudit.draws);

const expectStill = async (page) => {
  const before = await draws(page);
  await page.waitForTimeout(PAUSE_CHECK_MS);
  expect(await draws(page)).toBe(before);
};

test("Stage resumes when reduced motion is disabled and stops again when enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStage(page);
  await expectStill(page);
  const before = await draws(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => draws(page)).toBeGreaterThan(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectStill(page);
  const paused = await draws(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => draws(page)).toBeGreaterThan(paused);
});

test("Stage speed changes retain the canvas and compiled shaders", async ({ page }) => {
  await openStage(page);
  const canvas = await page.locator("[data-stage-background] canvas").elementHandle();
  const compiles = await page.evaluate(() => window.stageAudit.compiles);
  expect(compiles).toBeGreaterThan(0);
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  const speed = page.getByRole("slider", { name: "Background speed" });
  await speed.click();
  for (let step = 0; step < SPEED_STEPS; step++) {
    await page.keyboard.press(step % 2 ? "ArrowLeft" : "ArrowRight");
    await expect(speed).toHaveAttribute("aria-valuenow", step % 2 ? "1" : "1.25");
  }
  await page.evaluate(() => AeroTizen.applyBackground());
  expect(await canvas.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.stageAudit.compiles)).toBe(compiles);
  const before = await draws(page);
  await expect.poll(() => draws(page)).toBeGreaterThan(before);
});

test("Stage releases its context and remains stopped after Performance mode or a scene change", async ({ page }) => {
  await openStage(page);
  const original = await page.locator("[data-stage-background] canvas").elementHandle();
  await page.evaluate(() => {
    AeroTizen.settings.update({ performanceMode: true });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("#bg canvas")).toHaveCount(0);
  expect(await original.evaluate((node) => node.getContext("webgl").isContextLost())).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expectStill(page);
  await page.evaluate(() => {
    AeroTizen.settings.update({ performanceMode: false });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("[data-stage-background] canvas")).toHaveCount(1);
  const before = await draws(page);
  await expect.poll(() => draws(page)).toBeGreaterThan(before);
  const restored = await page.locator("[data-stage-background] canvas").elementHandle();
  await page.evaluate(() => {
    AeroTizen.settings.update({ background: "black" });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("[data-stage-background]")).toHaveCount(0);
  expect(await restored.evaluate((node) => node.getContext("webgl").isContextLost())).toBe(true);
  await expectStill(page);
});
