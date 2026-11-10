const { test, expect } = require("@playwright/test");

test("status views update from shared data without querying status markup", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-02T13:05:00Z") });
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        home: ["demo0"],
        background: "black",
        showWeather: true,
        weatherShowLocation: true,
        clockLayout: "custom",
        aeroClockStyle: "vertical",
        timeFormat: "24",
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
  });
  await page.goto("/");
  await expect(page.locator("[data-weather-part=temperature]")).toHaveText("12°");
  await expect(page.locator("[data-weather-part=location]")).toHaveText("Test city");
  await page.evaluate(() => {
    const getById = document.getElementById.bind(document);
    document.getElementById = (id) => {
      if (["weather", "network", "date", "time"].includes(id))
        throw new Error("Status services must not query view markup");
      return getById(id);
    };
    AeroTizen.settings.update({ tempUnit: "F" });

    AeroTizen.clock.tick();
  });
  await expect(page.locator("[data-weather-part=temperature]")).toHaveText("54°");
  for (const style of ["horizontal", "minimal", "bold"]) {
    await page.evaluate((style) => {
      AeroTizen.settings.update({ aeroClockStyle: style });
    }, style);
    await expect(page.locator("[data-clock=expanded]")).toHaveAttribute("data-clock-layout", style);
    await expect(page.locator("[data-weather-part=temperature]")).toHaveText("54°");
  }
  await page.evaluate(() => {
    AeroTizen.settings.update({ clockLayout: "classic" });
  });
  await expect(page.locator("#time")).toBeVisible();
  await expect(page.locator("#weather b")).toHaveText("54°");
  await context.setOffline(true);
  await page.evaluate(() => AeroTizen.network.refresh());
  await expect(page.locator("#network")).toHaveAttribute("data-net-kind", "offline");
  await page.evaluate(() => {
    AeroTizen.settings.update({ showNetwork: false });
  });
  await expect(page.locator("#network")).toBeHidden();
  await page.evaluate(() => {
    AeroTizen.settings.update({ showNetwork: true });
  });
  await expect(page.locator("#network")).toBeVisible();
  await page.clock.fastForward(2 * 60 * 60 * 1000 + 10000);
  await expect(page.locator("#weather")).toBeHidden();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
