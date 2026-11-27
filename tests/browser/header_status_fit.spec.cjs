const { test, expect } = require("./launcher_fixture.cjs");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");

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
      if (localStorage.getItem("aerotizen.settings.v1")) {
        return;
      }
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

test("the clock position setting puts the status first and the remote follows the visible order", async ({ page }) => {
  await openHome(page, { theme: "classic" }, "London", LONGEST_DATE_DAY);
  const headerOrder = () =>
    page.evaluate(() => {
      const left = (selector) => document.querySelector(selector).getBoundingClientRect().left;
      return ["[data-header-status]", "[data-header-tabs]", "[data-header-shortcuts]"]
        .map((selector) => [selector, left(selector)])
        .sort((a, b) => a[1] - b[1])
        .map(([selector]) => selector);
    });

  await test.step("the status is last by default", async () => {
    expect(await headerOrder()).toEqual(["[data-header-shortcuts]", "[data-header-tabs]", "[data-header-status]"]);
  });

  await test.step("choosing the start in Settings moves the status first and the setting survives a reload", async () => {
    await page.locator("#gear").click();
    await openCategory(page, "status");
    await page.locator('[data-key="clock-position:start"]').click();
    await closeSettings(page);
    expect(await headerOrder()).toEqual(["[data-header-status]", "[data-header-tabs]", "[data-header-shortcuts]"]);
    await page.reload();
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    expect(await headerOrder()).toEqual(["[data-header-status]", "[data-header-tabs]", "[data-header-shortcuts]"]);
  });

  await test.step("the arrow keys go from the tabs to the shortcuts in the order they are drawn", async () => {
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#home-tab")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#apps-tab")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#gear")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#samsung-home-shortcut")).toBeFocused();
  });
});
