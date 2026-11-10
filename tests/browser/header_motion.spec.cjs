const { test, expect } = require("@playwright/test");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${build} header follows live motion preferences and keeps remote focus aligned`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript(() =>
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["demo0"], background: "black", showWeather: false }),
      ),
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(url);
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    const tabs = page.locator("[data-header-focus=tabs]");
    const shortcuts = page.locator("[data-header-focus=shortcuts]");
    await page.locator("#apps-tab").click();
    await page.locator("#home-tab").click();
    await expect(tabs).toHaveCSS("transition-duration", "0.18s, 0.15s");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#gear")).toBeFocused();
    await expect(shortcuts).toHaveCSS("transition-duration", "0.18s, 0.15s");

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const glassSettings of [false, true]) {
      await page.evaluate((glassSettings) => {
        AeroTizen.settings.update({ glassSettings: glassSettings });
      }, glassSettings);
      for (const plate of [tabs, shortcuts]) {
        const durations = await plate.evaluate((node) =>
          getComputedStyle(node).transitionDuration.split(",").map(parseFloat),
        );
        expect(durations.every((duration) => duration === 0)).toBe(true);
      }
      await page.keyboard.press("ArrowRight");
      await expect(page.locator("#samsung-home-shortcut")).toBeFocused();
      await expect(shortcuts).toHaveCSS("opacity", "1");
      const error = await shortcuts.evaluate((plate) => {
        const target = document.querySelector("#samsung-home-shortcut");
        const a = plate.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        return Math.max(
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
          Math.abs(a.width - b.width),
          Math.abs(a.height - b.height),
        );
      });
      expect(error).toBeLessThan(1);
      await page.keyboard.press("ArrowLeft");
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(tabs).toHaveCSS("transition-duration", "0.18s, 0.15s");
    await expect(shortcuts).toHaveCSS("transition-duration", "0.18s, 0.15s");
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
