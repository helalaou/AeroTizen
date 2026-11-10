const { test, expect } = require("@playwright/test");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} weather uses one service for settings, status and photos and releases resources`, async ({ page }) => {
    const errors = [];
    const forecasts = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(message.text());
    });
    await page.clock.install({ time: new Date("2026-11-10T12:00Z") });
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
    await page.route("https://ipapi.co/**", (route) =>
      route.fulfill({ json: { latitude: 51.5, longitude: -0.12, city: "London" } }),
    );
    await page.route("https://api.open-meteo.com/**", (route) => {
      forecasts.push(route.request().url());
      const fahrenheit = new URL(route.request().url()).searchParams.has("temperature_unit");
      return route.fulfill({
        json: {
          current: { temperature_2m: fahrenheit ? 54 : 12, weather_code: 3 },
          daily: { sunrise: ["2026-11-10T06:00"], sunset: ["2026-11-10T18:00"] },
        },
      });
    });
    await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
      route.fulfill({ json: { results: [{ name: "Paris", latitude: 48.85, longitude: 2.35, country: "France" }] } }),
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0"],
          background: "black",
          showWeather: true,
          weatherShowLocation: true,
          tempUnit: "C",
        }),
      );
      localStorage.setItem(
        "aerotizen.weather.v2",
        JSON.stringify({
          temp: 12,
          code: 3,
          city: "London",
          unit: "C",
          source: "auto",
          at: Date.now(),
        }),
      );
      const polls = (window.weatherPolls = new Set());
      const start = window.setInterval.bind(window);
      const stop = window.clearInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const id = start(callback, delay, ...args);
        if (delay === 20 * 60 * 1000) polls.add(id);
        return id;
      };
      window.clearInterval = (id) => {
        polls.delete(id);
        stop(id);
      };
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    await expect(page.locator("#weather b")).toHaveText("12°");
    await expect(page.locator("#weather span")).toHaveText("London");
    expect(forecasts).toHaveLength(0);
    expect(await page.evaluate(() => window.Weather)).toBeUndefined();
    const polls = () => page.evaluate(() => window.weatherPolls.size);
    expect(await polls()).toBe(1);
    await page.evaluate(() => {
      window.weatherOwner = AeroTizen.weather;
      AeroTizen.weather.start();
    });
    await page.locator("#gear").click();
    await openCategory(page, "weather");
    await page.locator('[data-key="units:F"]').click();
    await expect(page.locator("#weather b")).toHaveText("54°");
    await expect.poll(() => forecasts.length).toBe(1);
    await expect.poll(() => page.evaluate(() => AeroTizen.weather.currentReading()?.unit)).toBe("F");
    await page.locator('[data-key="weather-visibility:false"]').click();
    await expect(page.locator("#weather span")).toHaveCount(0);
    await page.locator('[data-key="weather-display:false"]').click();
    await expect(page.locator("#weather")).toBeHidden();
    expect(await polls()).toBe(0);
    await page.locator('[data-key="weather-display:true"]').click();
    await expect(page.locator("#weather b")).toHaveText("54°");
    expect(await polls()).toBe(1);
    expect(forecasts).toHaveLength(1);
    await page.locator('[data-key="weather:change"]').click();
    await page.getByRole("textbox", { name: "Weather location", exact: true }).fill("Paris");
    await page.locator('[data-key="weather:search"]').click();
    await expect(page.locator('[data-key="weather:result:0"]')).toHaveText("Paris, France");
    await page.locator('[data-key="weather:result:0"]').click();
    await expect.poll(() => page.evaluate(() => AeroTizen.weather.currentReading()?.city)).toBe("Paris");
    expect(forecasts).toHaveLength(2);
    await closeSettings(page);
    await page.evaluate(() => {
      AeroTizen.settings.update({ showWeather: false, weatherPhoto: true });
      AeroTizen.applyBackground();
    });
    await expect(page.locator("#weather")).toBeHidden();
    await expect(page.locator("[data-weather-photo]")).toHaveAttribute("data-weather-photo", "cloud");
    expect(await polls()).toBe(1);
    expect(forecasts).toHaveLength(2);
    expect(await page.evaluate(() => AeroTizen.weather === window.weatherOwner)).toBe(true);
    await page.evaluate(() => {
      AeroTizen.weather.dispose();
      AeroTizen.weather.dispose();
    });
    expect(await polls()).toBe(0);
    await page.evaluate(() => {
      AeroTizen.settings.update({ tempUnit: "C" });
      AeroTizen.clock.tick();
      AeroTizen.weather.start();
    });
    await page.clock.fastForward(20 * 60 * 1000);
    expect(forecasts).toHaveLength(2);
    expect(await polls()).toBe(0);
    expect(errors).toEqual([]);
  });
}
