const { test, expect } = require("@playwright/test");
const { openCategory } = require("./drawer_helpers.cjs");

const paris = {
  name: "Paris",
  admin1: "Île-de-France",
  country: "France",
  country_code: "FR",
  latitude: 48.85,
  longitude: 2.35,
};
const boston = {
  name: "Boston",
  admin1: "Massachusetts",
  country: "United States",
  country_code: "US",
  latitude: 42.36,
  longitude: -71.06,
};
const entries = [
  { name: "compiled", url: "http://127.0.0.1:8171/" },
  { name: "development", url: "http://127.0.0.1:8172/" },
];

const setup = async (page, { url, glassSettings = false, language = "en" }) => {
  const errors = [];
  const searches = [];
  const pending = [];
  let hold = false;
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
    if (hold) {
      pending.push(route);
      return;
    }
    return route.fulfill({ json: { results: [paris, boston] } });
  });
  await page.addInitScript(
    ({ glassSettings, language }) => {
      if (!localStorage.getItem("aerotizen.settings.v1")) {
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            home: ["demo0"],
            background: "black",
            glassSettings,
            language,
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
    },
    { glassSettings, language },
  );
  await page.goto(url);
  await page.locator("#gear").click();
  await openCategory(page, "weather");
  await expect(page.locator("[data-weather-location-summary]")).toContainText("London");
  return {
    errors,
    searches,
    pending,
    hold: () => {
      hold = true;
    },
    release: () => {
      hold = false;
    },
    reply: async (index, json) => pending[index].fulfill({ json }).catch(() => {}),
  };
};

for (const entry of entries) {
  for (const glassSettings of [false, true]) {
    test(`${entry.name} ${glassSettings ? "Glass" : "Classic"} weather groups Home controls and saves an explicit location without extra searches`, async ({
      page,
    }) => {
      const h = await setup(page, { ...entry, glassSettings });
      const summary = page.locator("[data-weather-location-summary]");
      const change = page.locator('[data-key="weather:change"]');
      const input = page.getByRole("textbox", { name: "Weather location", exact: true });
      await expect(page.getByRole("heading", { name: "Home weather", exact: true })).toBeVisible();
      await expect(page.locator('#weather-display [aria-pressed="true"]')).toHaveText("Off");
      await expect(page.locator('#weather-visibility [aria-pressed="true"]')).toHaveText("Off");
      await expect(summary).toHaveText("Automatic · London");
      await expect(input).toBeHidden();
      await expect(change).toHaveAttribute("aria-expanded", "false");
      expect(h.searches).toEqual([]);
      await page.locator('[data-key="weather-display:true"]').click();
      await expect(page.locator("#weather b")).toHaveText("12°");
      await expect(page.locator("#weather span")).toHaveCount(0);
      await page.locator('[data-key="weather-visibility:true"]').click();
      await expect(page.locator("#weather span")).toHaveText("London");
      await page.locator('[data-key="units:F"]').click();
      await expect(page.locator("#weather b")).toHaveText("54°");
      await page.locator('[data-key="weather-display:false"]').click();
      await expect(summary).toHaveText("Automatic · London");
      h.hold();
      await change.click();
      await expect(input).toBeFocused();
      await expect(change).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("heading", { name: "Home weather", exact: true })).toBeHidden();
      expect(h.searches).toEqual([]);
      await input.fill("Paris");
      await input.press("Enter");
      const search = page.locator('[data-key="weather:search"]');
      await expect(search).toHaveText("Searching…");
      await expect(search).toHaveAttribute("aria-busy", "true");
      await expect(search).toHaveAttribute("aria-disabled", "true");
      await expect(search).toBeFocused();
      await expect.poll(() => h.searches.length).toBe(1);
      // Native key repeats and clicks during a pending search keep the same request.
      await search.evaluate((element) => element.click());
      await input.focus();
      await input.press("Enter");
      expect(h.searches).toEqual(["Paris"]);
      await h.reply(0, { results: [paris, boston] });
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
  }

  test(`${entry.name} weather search handles IME Done, cancellation, validation and retries`, async ({ page }) => {
    const h = await setup(page, entry);
    const change = page.locator('[data-key="weather:change"]');
    const input = page.getByRole("textbox", { name: "Weather location", exact: true });
    const search = page.locator('[data-key="weather:search"]');
    const status = page.locator("#weather-search-status");
    await change.click();
    await input.fill("x");
    await input.press("Enter");
    await expect(status).toContainText("Enter at least two characters");
    expect(h.searches).toEqual([]);
    h.hold();
    await input.fill("Old query");
    await input.evaluate((element) => {
      element.focus();
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: AeroTizen.config.KEY.ENTER,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(input).toBeFocused();
    expect(h.searches).toEqual([]);
    await input.evaluate((element) => {
      element.focus();
      element.dispatchEvent(
        new KeyboardEvent("keydown", { keyCode: AeroTizen.config.KEY.IME_DONE, bubbles: true, cancelable: true }),
      );
    });
    await expect.poll(() => h.searches.length).toBe(1);
    await expect(search).toBeFocused();
    await input.fill("Boston");
    await input.press("Enter");
    await expect.poll(() => h.searches.length).toBe(2);
    await h.reply(0, { results: [paris] });
    await h.reply(1, { results: [boston] });
    await expect(page.locator('[data-key="weather:result:0"]')).toHaveText("Boston, Massachusetts, United States");
    await expect(page.locator('[data-key="weather:result:0"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#weather-location-editor")).toBeHidden();
    await expect(change).toBeFocused();
    await expect(page.locator('[data-section-pane="weather"]')).toBeVisible();
    await change.click();
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(input).not.toBeFocused();
    await expect(page.locator("#weather-location-editor")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#weather-location-editor")).toBeHidden();
    await change.click();
    await input.fill("Missing");
    await input.press("Enter");
    await expect.poll(() => h.searches.length).toBe(3);
    await h.reply(2, { results: [] });
    await expect(status).toContainText("No locations found");
    await search.click();
    await expect.poll(() => h.searches.length).toBe(4);
    await h.reply(3, { error: true });
    await expect(status).toContainText("Check your connection and try again");
    await search.click();
    await expect.poll(() => h.searches.length).toBe(5);
    await openCategory(page, "status");
    await h.reply(4, { results: [paris] });
    await openCategory(page, "weather");
    await expect(page.locator("#weather-location-editor")).toBeHidden();
    await change.click();
    await expect(page.locator("#weather-results")).toBeHidden();
    await expect(search).toHaveAttribute("aria-busy", "false");
    expect(h.errors).toEqual([]);
  });
}

for (const language of ["en", "fr", "it", "pt-BR", "ru", "ar"]) {
  test(`${language} Weather controls and location fit the shared pane`, async ({ page }) => {
    const h = await setup(page, { ...entries[0], language, glassSettings: language === "ar" });
    const pane = page.locator('[data-settings-drawer="scroll"]');
    const bounds = await pane.boundingBox();
    for (const control of await page.locator('[data-section-pane="weather"] [data-key]:visible').all()) {
      const rect = await control.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    await page.locator('[data-key="weather:change"]').click();
    await page.locator("#weather-location input").fill("Paris");
    await page.locator("#weather-location input").press("Enter");
    const result = page.locator('[data-key="weather:result:0"]');
    await expect(result).toBeFocused();
    const inset = await result.evaluate((button) => {
      const label = button.querySelector("span").getBoundingClientRect();
      const box = button.getBoundingClientRect();
      return document.documentElement.dir === "rtl" ? box.right - label.right : label.left - box.left;
    });
    expect(inset).toBeCloseTo(18, 0);
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-weather-location-summary]")).toContainText("Paris");
    expect(h.errors).toEqual([]);
  });
}

for (const entry of entries) {
  for (const glassSettings of [false, true]) {
    test(`${entry.name} ${glassSettings ? "Glass" : "Classic"} weather focus ring follows editor layout changes`, async ({
      page,
    }) => {
      const h = await setup(page, { ...entry, glassSettings });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const change = page.locator('[data-key="weather:change"]');
      const input = page.getByRole("textbox", { name: "Weather location", exact: true });
      const expectRing = () =>
        expect
          .poll(
            () =>
              page.locator('[data-settings-focus="content"]').evaluate((ring) => {
                const target = document.querySelector('#editor [data-focused="true"]');
                if (!target || ring.dataset.visible !== "true") return Infinity;
                const a = ring.getBoundingClientRect();
                const b = target.getBoundingClientRect();
                return Math.max(
                  Math.abs(a.x - b.x),
                  Math.abs(a.y - b.y),
                  Math.abs(a.width - b.width),
                  Math.abs(a.height - b.height),
                );
              }),
            { timeout: 2000 },
          )
          .toBeLessThan(1);
      await expectRing();
      await change.focus();
      await expectRing();
      await page.keyboard.press("Enter");
      await expect(input).toBeFocused();
      await expectRing();
      await input.fill("Paris");
      await input.press("Enter");
      await expect(page.locator('[data-key="weather:result:0"]')).toBeFocused();
      await expectRing();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator('[data-key="weather:result:1"]')).toBeFocused();
      await expectRing();
      await change.focus();
      await expectRing();
      // Closing with the same focused key must remeasure its new position.
      await page.keyboard.press("Enter");
      await expect(page.locator("#weather-location-editor")).toBeHidden();
      await expectRing();
      await page.evaluate(() =>
        AeroTizen.settings.update({
          weatherLocation: {
            name: "Longtown",
            label: Array(8).fill("Longtown district, county and region").join(", "),
            latitude: 1,
            longitude: 2,
          },
        }),
      );
      await expectRing();
      await change.click();
      await input.press("Escape");
      await page.keyboard.press("Escape");
      await expect(change).toBeFocused();
      await expectRing();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => {
        window.focusRectReads = 0;
        const read = Element.prototype.getBoundingClientRect;
        window.restoreFocusRead = () => {
          Element.prototype.getBoundingClientRect = read;
        };
        Element.prototype.getBoundingClientRect = function () {
          window.focusRectReads++;
          return read.call(this);
        };
      });
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => window.focusRectReads)).toBe(0);
      await page.evaluate(() => window.restoreFocusRead());
      expect(h.errors).toEqual([]);
    });
  }
}
