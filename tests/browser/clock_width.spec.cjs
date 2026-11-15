const { test, expect } = require("./launcher_fixture.cjs");

const expectedClockWidth = (clock) =>
  clock.evaluate((node) => {
    const style = getComputedStyle(node);
    const context = document.createElement("canvas").getContext("2d");
    context.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    let width = context.measureText("0").width * 8;
    const sample = new Date(2000, 0, 1);
    for (let minute = 0; minute < 1440; minute++) {
      sample.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      width = Math.max(width, context.measureText(AeroTizen.clock.formatTime(sample, "12")).width + 1);
    }
    return Math.ceil(width) + "px";
  });

for (const locale of ["en-GB", "ko-KR"]) {
  test.describe(locale, () => {
    test.use({ locale });
    test("clock sizing yields during startup and retains the exact full-day width", async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript(() => {
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            home: ["demo0", "demo1"],
            background: "midnight",
            showWeather: false,
            timeFormat: "12",
          }),
        );
        window.clockWidthAudit = { active: true, count: 0, maxBlock: 0 };
        let count = 0;
        let queued = false;
        const measure = CanvasRenderingContext2D.prototype.measureText;
        CanvasRenderingContext2D.prototype.measureText = function (text) {
          if (window.clockWidthAudit.active) {
            window.clockWidthAudit.count++;
            count++;
            if (!queued) {
              queued = true;
              Promise.resolve().then(() => {
                window.clockWidthAudit.maxBlock = Math.max(window.clockWidthAudit.maxBlock, count);
                count = 0;
                queued = false;
              });
            }
          }
          return measure.call(this, text);
        };
      });
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready && window.clockWidthAudit.count >= 1441);
      expect(await page.evaluate(() => window.clockWidthAudit.maxBlock)).toBeLessThanOrEqual(60);
      await page.evaluate(() => {
        window.clockWidthAudit.active = false;
      });
      const clock = page.locator("#time");
      await expect(clock).toHaveCSS("width", await expectedClockWidth(clock));
      await page.keyboard.press("ArrowRight");
      await expect(page.locator('#grid > [data-id="demo1"]')).toBeFocused();
      expect(errors).toEqual([]);
    });
  });
}

test("the compact clock reserves the correct width after a delayed Gloss font load", async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        home: ["demo0", "demo1"],
        theme: "gloss",
        language: "en",
        background: "black",
        showWeather: false,
        timeFormat: "12",
      }),
    );
  });
  let releaseFonts;
  const fontDelay = new Promise((resolve) => {
    releaseFonts = resolve;
  });
  const fontFiles = "**/fonts/googlesans/*.woff2";
  await page.route(fontFiles, async (route) => {
    await fontDelay;
    await route.continue();
  });
  await page.clock.install();
  try {
    const requested = page.waitForRequest(fontFiles);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await requested;
    const clock = page.locator("#time");
    await expect(clock).toBeVisible();
    await page.clock.runFor(1000);
    expect(await clock.evaluate((node) => node.style.width)).toBe("");
    releaseFonts();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.clock.runFor(1000);
    await expect(clock).toHaveCSS("width", await expectedClockWidth(clock));
  } finally {
    releaseFonts();
  }
});
