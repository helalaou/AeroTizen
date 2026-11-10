const { test, expect } = require("@playwright/test");

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
      const expected = await page.evaluate(() => {
        window.clockWidthAudit.active = false;
        const style = getComputedStyle(document.querySelector("#time"));
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
      await expect(page.locator("#time")).toHaveCSS("width", expected);
      await page.keyboard.press("ArrowRight");
      await expect(page.locator('#grid > [data-id="demo1"]')).toBeFocused();
      expect(errors).toEqual([]);
    });
  });
}
