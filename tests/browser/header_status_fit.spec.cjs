const { test, expect } = require("./launcher_fixture.cjs");

const THEMES = ["classic", "glass", "gloss", "mint", "halo"];
const LANGUAGES = ["en", "fr", "it", "pt-BR", "ru", "ar"];
const SHORT_CITY = "Rome";
const LONG_CITY = "A very long fixture city name";
const FIXED_DAY = "2026-10-29T10:20:00Z";
const LONGEST_DATE_DAY = "2026-09-30T10:20:00Z";
const TAB_CLEARANCE = 24;
const VIEWPORT_CENTRE = 960;
const STATUS_PARTS = ["#weather", "#date", "#time"];
const CITY = "#weather > span";
const TEMPERATURE = "#weather > b";
const DATE_TEXT = "#date > span";

const openHome = async (page, settings, city, day = FIXED_DAY) => {
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
    ([parts, city, temperature, dateText]) => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const shortened = (selector) => {
        const node = document.querySelector(selector);
        return node.scrollWidth > node.clientWidth;
      };
      const tabs = box("[data-header-tabs]");
      const [reading, date] = [box(temperature), box("#date")];
      const gaps = parts.map((part) => Math.round(Math.max(tabs.left - box(part).right, box(part).left - tabs.right)));
      return {
        tabsCentre: Math.round((tabs.left + tabs.right) / 2),
        nearestPart: Math.min(...gaps),
        readingToDate: Math.round(Math.max(date.left - reading.right, reading.left - date.right)),
        cityShortened: shortened(city),
        dateShortened: shortened(dateText),
      };
    },
    [STATUS_PARTS, CITY, TEMPERATURE, DATE_TEXT],
  );

for (const theme of THEMES) {
  for (const language of LANGUAGES) {
    test(`${theme} header shortens a long city before it reaches the tabs in ${language}`, async ({ page }) => {
      await openHome(page, { theme, language }, LONG_CITY);
      const fit = await headerFit(page);
      expect(fit.nearestPart).toBeGreaterThanOrEqual(TAB_CLEARANCE);
      expect(fit.tabsCentre).toBe(VIEWPORT_CENTRE);
      expect(fit.cityShortened).toBe(true);
      expect(fit.dateShortened).toBe(false);
    });

    test(`${theme} header keeps the longest date clear of the tabs in ${language}`, async ({ page }) => {
      await openHome(page, { theme, language, dateFormat: "long" }, LONG_CITY, LONGEST_DATE_DAY);
      const fit = await headerFit(page);
      expect(fit.nearestPart).toBeGreaterThanOrEqual(TAB_CLEARANCE);
      expect(fit.tabsCentre).toBe(VIEWPORT_CENTRE);
      expect(fit.readingToDate).toBeGreaterThan(0);
    });
  }

  test(`${theme} header shows a short city in full`, async ({ page }) => {
    await openHome(page, { theme, language: "en", timeFormat: "24" }, SHORT_CITY);
    const fit = await headerFit(page);
    expect(fit.nearestPart).toBeGreaterThanOrEqual(TAB_CLEARANCE);
    expect(fit.tabsCentre).toBe(VIEWPORT_CENTRE);
    expect(fit.cityShortened).toBe(false);
    expect(fit.dateShortened).toBe(false);
  });
}
