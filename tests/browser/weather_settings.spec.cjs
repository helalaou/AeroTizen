const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");
const paris = {
  name: "Paris",
  admin1: "Île-de-France",
  country: "France",
  country_code: "FR",
  latitude: 48.85,
  longitude: 2.35,
};
const setup = async (page) => {
  const errors = [];
  const searches = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.route("https://ipapi.co/**", (route) =>
    route.fulfill({ json: { city: "London", latitude: 51.5, longitude: -0.12 } }),
  );
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      json: {
        current: {
          temperature_2m: new URL(route.request().url()).searchParams.has("temperature_unit") ? 54 : 12,
          weather_code: 3,
        },
      },
    }),
  );
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => {
    searches.push(new URL(route.request().url()).searchParams.get("name"));
    return route.fulfill({ json: { results: [paris] } });
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0"],
          background: "black",
          theme: "glass",
          showWeather: false,
          weatherShowLocation: false,
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
    }
  });
  await page.goto("/");
  await page.locator("#gear").click();
  await openCategory(page, "weather");
  return { errors, searches };
};
test("weather can be enabled, searched, saved and restored to automatic location", async ({ page }) => {
  const h = await setup(page);
  const summary = page.locator("[data-weather-location-summary]");
  const change = page.locator('[data-key="weather:change"]');
  const input = page.getByRole("textbox", { name: "Weather location", exact: true });
  await expect(page.getByRole("heading", { name: "Show weather", exact: true })).toBeVisible();
  const display = page.getByRole("switch", { name: "Show weather", exact: true });
  const locationName = page.getByRole("switch", { name: "Show location name", exact: true });
  await expect(display).toHaveAttribute("aria-checked", "false");
  await expect(locationName).toBeHidden();
  await expect(page.locator("#units")).toBeHidden();
  await expect(summary).toBeHidden();
  await expect(change).toBeHidden();
  await expect(input).toBeHidden();
  await expect(change).toHaveAttribute("aria-expanded", "false");
  expect(h.searches).toEqual([]);
  await display.click();
  await expect(page.locator("#weather b")).toHaveText("12°");
  await expect(page.locator("#weather span")).toHaveCount(0);
  await expect(locationName).toHaveAttribute("aria-checked", "false");
  await locationName.click();
  await expect(page.locator("#weather span")).toHaveText("London");
  await page.locator('[data-key="units:F"]').click();
  await expect(page.locator("#weather b")).toHaveText("54°");
  await change.click();
  await expect(input).toBeFocused();
  await expect(change).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Show weather", exact: true })).toBeVisible();
  expect(h.searches).toEqual([]);
  await input.fill("Paris");
  await input.press("Enter");
  const first = page.locator('[data-key="weather:result:0"]');
  await expect(first).toBeFocused();
  await expect(first).toHaveText("Paris, Île-de-France, France");
  await page.keyboard.press("Enter");
  await expect(page.locator("#weather-location-editor")).toBeHidden();
  await expect(change).toBeFocused();
  await expect(summary).toHaveText("Paris, Île-de-France, France · Manual");
  const chosen = await page.evaluate(() => AeroTizen.settings.getSnapshot().weatherLocation);
  expect(chosen).toMatchObject({ name: "Paris", latitude: paris.latitude, longitude: paris.longitude });
  await page.reload();
  await page.locator("#gear").click();
  await openCategory(page, "weather");
  await expect(summary).toHaveText("Paris, Île-de-France, France · Manual");
  await expect(input).toBeHidden();
  await expect(page.locator('#units [aria-pressed="true"]')).toHaveText("°F Fahrenheit");
  await change.click();
  await page.locator('[data-key="weather:auto"]').click();
  await expect(summary).toHaveText("Automatic · London");
  await expect(change).toBeFocused();
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().weatherLocation)).toBeNull();
  expect(h.searches).toEqual(["Paris"]);
  expect(h.errors).toEqual([]);
});
