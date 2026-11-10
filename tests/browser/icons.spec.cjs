const { test, expect } = require("@playwright/test");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const glass of [false, true]) {
  test(`${glass ? "Glass" : "Classic"} weather, selection badges and preview icons use the theme styles`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let weatherCode = 3;
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("https://ipapi.co/**", (route) => route.fulfill({ json: { latitude: 1, longitude: 2 } }));
    await page.route("https://api.open-meteo.com/**", (route) =>
      route.fulfill({ json: { current: { temperature_2m: 12, weather_code: weatherCode } } }),
    );
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((glass) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          glassSettings: glass,
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
    }, glass);
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
      glass ? "rgb(71, 82, 105)" : "rgb(124, 92, 255)",
    );
    await openCategory(page, "wallpaper");
    await page.locator('[data-key="wallpaper-categories:animated"]').click();
    await page.locator('[data-key="bg:aurora"]').click();
    const preview = page.getByRole("button", { name: "Preview", exact: true });
    const play = preview.locator(".lucide-play");
    await expect(play).toHaveAttribute("aria-hidden", "true");
    const layout = await play.evaluate((icon) => {
      const label = document.createRange();
      label.selectNode(icon.nextSibling);
      const iconBox = icon.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      return {
        gap: labelBox.left - iconBox.right,
        centerOffset: Math.abs(labelBox.top + labelBox.height / 2 - (iconBox.top + iconBox.height / 2)),
      };
    });
    expect(layout.gap).toBeGreaterThan(0);
    expect(layout.centerOffset).toBeLessThanOrEqual(1);
    await closeSettings(page);
    await expect(page.locator("#grid > [data-id]")).toHaveCount(1);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
