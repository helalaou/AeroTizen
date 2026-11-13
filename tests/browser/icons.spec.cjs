const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const theme of ["classic", "glass"]) {
  test(`${theme} weather, selection badges and slider arrows use the theme styles`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let weatherCode = 3;
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("https://ipapi.co/**", (route) => route.fulfill({ json: { latitude: 1, longitude: 2 } }));
    await page.route("https://api.open-meteo.com/**", (route) =>
      route.fulfill({ json: { current: { temperature_2m: 12, weather_code: weatherCode } } }),
    );
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((theme) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          theme,
          home: ["demo0"],
          background: "black",
          showWeather: true,
          tempUnit: "C",
        }),
      );
      localStorage.setItem(
        "aerotizen.weather.v2",
        JSON.stringify({
          temp: 12,
          code: 3,
          city: "Test city",
          source: "auto",
          unit: "C",
          at: Date.now(),
        }),
      );
    }, theme);
    await page.goto("/");
    await expect(page).toHaveTitle("AeroTizen");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    const gear = page.getByRole("button", { name: "Settings", exact: true });
    for (const [code, colour] of [
      [0, "rgb(255, 211, 77)"],
      [2, "rgb(255, 211, 77)"],
      [3, "rgb(213, 219, 228)"],
      [45, "rgb(213, 219, 228)"],
      [51, "rgb(108, 182, 255)"],
      [71, "rgb(255, 255, 255)"],
      [95, "rgb(255, 211, 77)"],
    ]) {
      weatherCode = code;
      await page.evaluate(() => AeroTizen.weather.refresh());
      await expect.poll(() => page.evaluate(() => AeroTizen.weather.getSnapshot().code)).toBe(code);
      for (const background of ["solid-white", "solid-lavender", "black"]) {
        await page.evaluate((background) => {
          AeroTizen.settings.update({ background });
          AeroTizen.applyBackground();
        }, background);
        await expect(page.locator("#weather svg")).toHaveCSS(
          "stroke",
          background === "black" ? colour : "rgb(21, 21, 27)",
        );
      }
    }
    await gear.click();
    await openCategory(page, "apps");
    const selectedApp = page.locator('[data-key="app:demo0"]');
    await expect(selectedApp.locator("[data-selection-indicator]")).toHaveCSS(
      "background-color",
      theme === "glass" ? "rgb(71, 82, 105)" : "rgb(124, 92, 255)",
    );
    await openCategory(page, "wallpaper");
    await page.locator('[data-key="wallpaper-categories:animated"]').click();
    await page.locator('[data-key="bg:aurora"]').click();
    const speed = page.getByRole("slider", { name: "Background speed" });
    for (const [name, glyph] of [
      ["Decrease Background speed", ".lucide-chevron-left"],
      ["Increase Background speed", ".lucide-chevron-right"],
    ]) {
      const button = speed.getByRole("button", { name, exact: true });
      const icon = button.locator(glyph);
      await expect(icon).toHaveAttribute("aria-hidden", "true");
      await expect(icon).toHaveAttribute("focusable", "false");
      await expect(icon).toHaveCSS("stroke", await button.evaluate((node) => getComputedStyle(node).color));
      const layout = await icon.evaluate((node) => {
        const iconBox = node.getBoundingClientRect();
        const buttonBox = node.parentElement.getBoundingClientRect();
        return {
          horizontalOffset: Math.abs(iconBox.left + iconBox.width / 2 - (buttonBox.left + buttonBox.width / 2)),
          verticalOffset: Math.abs(iconBox.top + iconBox.height / 2 - (buttonBox.top + buttonBox.height / 2)),
        };
      });
      expect(layout.horizontalOffset).toBeLessThanOrEqual(1);
      expect(layout.verticalOffset).toBeLessThanOrEqual(1);
    }
    await closeSettings(page);
    await expect(page.locator("#grid > [data-id]")).toHaveCount(1);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
