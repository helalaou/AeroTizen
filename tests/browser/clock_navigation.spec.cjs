const { openCategory } = require("./drawer_helpers.cjs");
const { test, expect } = require("@playwright/test");

const errors = new WeakMap();
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (e) => errors.get(page).push(e.message));
  await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
  await page.addInitScript(() =>
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        background: "black",
        showWeather: false,
        home: ["demo0", "demo1", "demo2"],
        clockLayout: "classic",
      }),
    ),
  );
});

test("clock layouts are in one group and keep remote navigation stable on selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.locator("#gear").click();
  await openCategory(page, "status");
  await expect(page.locator("#clock-layouts [role=button]:visible")).toHaveCount(5);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute("data-key", "clock-layouts:vertical");
  await page.keyboard.press("Enter");
  await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-key="clock-layouts:classic"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute("data-key", "time:12");
});
