const { test, expect } = require("./launcher_fixture.cjs");

const LONG_CITY = "A very long fixture city name";
const LONGEST_DATE_DAY = "2026-09-30T10:20:00Z";
const STATUS_PARTS = ["#weather", "#date", "#time"];
const CITY = "#weather > span";
const TEMPERATURE = "#weather > b";

const openHome = async (page, settings, city, day) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.clock.setFixedTime(new Date(day));
  await page.addInitScript(
    ([settings, city, day]) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0"],
          background: "black",
          clockLayout: "classic",
          showWeather: true,
          weatherShowLocation: true,
          ...settings,
        }),
      );
      localStorage.setItem(
        "aerotizen.weather.v2",
        JSON.stringify({ temp: 12, code: 3, day: 1, at: Date.parse(day), unit: "C", source: "auto", city }),
      );
    },
    [settings, city, day],
  );
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator(CITY)).toHaveText(city);
};

const headerFit = (page) =>
  page.evaluate(
    ([parts, temperature]) => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const tabs = box("[data-header-tabs]");
      const [reading, date] = [box(temperature), box("#date")];
      const gaps = parts.map((part) => Math.round(Math.max(tabs.left - box(part).right, box(part).left - tabs.right)));
      return {
        nearestPart: Math.min(...gaps),
        readingToDate: Math.round(Math.max(date.left - reading.right, reading.left - date.right)),
      };
    },
    [STATUS_PARTS, TEMPERATURE],
  );

for (const [theme, language] of [
  ["classic", "en"],
  ["glass", "ar"],
]) {
  test(`${theme} ${language} header keeps long weather and date text clear of navigation`, async ({ page }) => {
    await openHome(page, { theme, language, dateFormat: "long" }, LONG_CITY, LONGEST_DATE_DAY);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("#weather")).toBeVisible();
    await expect(page.locator("#date")).toBeVisible();
    await expect(page.locator("#time")).toBeVisible();
    const fit = await headerFit(page);
    expect(fit.nearestPart).toBeGreaterThan(0);
    expect(fit.readingToDate).toBeGreaterThan(0);
    await expect(page.locator("[data-header-tabs]")).toBeInViewport();
  });
}
