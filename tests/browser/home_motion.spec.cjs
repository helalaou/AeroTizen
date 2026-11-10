const { test, expect } = require("@playwright/test");
for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  for (const glassSettings of [false, true]) {
    test(`${build} ${glassSettings ? "Glass" : "Classic"} Continue Watching uses short focus motion and respects live reduced motion`, async ({
      page,
    }, info) => {
      await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
      await page.addInitScript(
        (glassSettings) =>
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({
              glassSettings,
              home: ["demo0"],
              background: "black",
              showWeather: false,
              continueWatching: true,
              inputNames: { "HDMI 2": "A long custom HDMI label" },
            }),
          ),
        glassSettings,
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(url);
      await expect(page).toHaveTitle("AeroTizen");
      await page.waitForFunction(
        () => AeroTizen.apps.getSnapshot().ready && AeroTizen.inputs.getSnapshot().sources.length === 4,
      );
      await page.evaluate(() => {
        const snapshot = AeroTizen.continueWatching.getSnapshot();
        const items = [{ key: "motion", title: "Motion fixture", sourceName: "YouTube", sourceId: "demo0" }];
        const next = { ...snapshot, items };
        AeroTizen.continueWatching.getSnapshot = () => next;
        AeroTizen.homeScreen.refreshApps();
      });
      const card = page.locator("#continue-items > [data-key]");
      await expect(card).toHaveCSS("transition-duration", "0.17s");
      expect(await card.evaluate((n) => getComputedStyle(n).transitionProperty)).toBe("transform");
      await expect
        .poll(() => card.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a))
        .toBeCloseTo(0.98, 2);
      await page.keyboard.press("ArrowDown");
      await expect(card).toHaveAttribute("data-focused", "true");
      await expect
        .poll(() => card.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a))
        .toBeCloseTo(1.035, 2);
      await page.screenshot({ path: info.outputPath("continue-focused.png") });
      const focusedShadow = await card.evaluate((n) => getComputedStyle(n).boxShadow);
      expect(focusedShadow).not.toBe("none");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(card).toHaveCSS("transition-duration", "0s");
      await expect(card).toBeFocused();
      expect(await card.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a)).toBeCloseTo(1.035, 2);
      await expect(card).toHaveCSS("box-shadow", focusedShadow);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(card).toHaveCSS("transition-duration", "0.17s");
      await expect(card).toHaveAttribute("data-focused", "true");
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    });
  }
}
