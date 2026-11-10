const { test, expect } = require("@playwright/test");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${build} Home cards, scrolling, actions and reorder arrows follow live motion preferences`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript(() =>
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0", "demo1", "demo2", "demo3"],
          homeAppLayout: "scroll",
          background: "black",
          showWeather: false,
        }),
      ),
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    const card = page.locator('#grid > [data-id="demo0"]');
    const rows = page.locator("[data-home-content]");
    const surface = page.locator("[data-home-page]");
    await expect(card).toHaveCSS("transition-duration", "0.15s");
    await expect(page.locator("#grid")).toHaveCSS("transition-duration", "0.22s");
    await expect(rows).toHaveCSS("transition-duration", "0.32s");
    await expect(surface).toHaveCSS("animation-duration", "0.24s");

    await page.keyboard.down("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await page.keyboard.up("Enter");
    await expect(menu).toHaveCSS("transition-duration", "0.14s, 0.14s");
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("data-moving", "true");
    const arrows = page.locator("[data-reorder-arrow]");
    await expect(arrows.first()).toBeVisible();
    await expect(arrows.first()).toHaveCSS("animation-duration", "1s");

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const glassSettings of [false, true]) {
      await page.evaluate((glassSettings) => {
        AeroTizen.settings.update({ glassSettings: glassSettings });
      }, glassSettings);
      await expect(card).toBeFocused();
      await expect(card).toHaveCSS("transition-duration", "0s");
      await expect(page.locator("#grid")).toHaveCSS("transition-duration", "0s");
      await expect(rows).toHaveCSS("transition-duration", "0s");
      await expect(surface).toHaveCSS("animation-duration", "0s");
      await expect(surface).toHaveCSS("opacity", "1");
      await expect(arrows.first()).toHaveCSS("animation-duration", "0s");
      await expect(arrows.first()).toBeVisible();
    }
    await page.keyboard.press("ArrowRight");
    await expect(card).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(card).not.toHaveAttribute("data-moving", "true");
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home[1])).toBe("demo0");
    await page.keyboard.down("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.up("Enter");
    await expect(menu).toHaveCSS("transition-duration", "0s, 0s");
    await expect(page.locator("[data-app-actions-focus]")).toHaveCSS("transition-duration", "0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(menu).toHaveCSS("transition-duration", "0.14s, 0.14s");
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
