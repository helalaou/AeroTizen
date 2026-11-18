const { openCategory, closeSettings } = require("./drawer_helpers.cjs");
const { test, expect } = require("./launcher_fixture.cjs");

test("custom clock styles preserve upstream date/time preferences, visibility and reload persistence", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.clock.install({ time: new Date("2026-10-28T14:05:00Z") });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().all.length > 0);
  await expect(page.locator("[data-clock=expanded]")).toBeHidden();
  await page.locator("#gear").click();
  await openCategory(page, "status");
  for (const style of ["vertical", "horizontal", "minimal", "bold"]) {
    await page.locator(`[data-key="clock-layouts:${style}"]`).click();
    await closeSettings(page);
    await expect(page.locator("[data-clock=expanded]")).toBeVisible();
    expect(await page.locator("[data-clock-part=time]").getAttribute("aria-label")).toBe(
      await page.evaluate(() =>
        AeroTizen.clock.formatTime(
          new Date(AeroTizen.clock.getSnapshot()),
          AeroTizen.settings.getSnapshot().timeFormat,
        ),
      ),
    );
    await page.screenshot({ path: info.outputPath("clock-" + style + ".png") });
    await page.locator("#gear").click();
    await openCategory(page, "status");
  }
  await page.locator('[data-key="time:24"]').click();
  await page.locator('[data-key="date:iso"]').click();
  await page.locator('[data-key="date-visibility"]').click();
  await closeSettings(page);
  await expect(page.locator("[data-clock-part=date]")).toBeHidden();
  await page.reload();
  await expect(page.locator("[data-clock=expanded]")).toHaveAttribute("data-clock-layout", "bold");
  expect(
    await page.evaluate(() => [
      AeroTizen.settings.getSnapshot().timeFormat,
      AeroTizen.settings.getSnapshot().showDate,
      AeroTizen.settings.getSnapshot().dateFormat,
    ]),
  ).toEqual(["24", false, "iso"]);
  await page.locator("#gear").click();
  await openCategory(page, "status");
  await page.locator('[data-key="clock-layouts:classic"]').click();
  await closeSettings(page);
  await expect(page.locator("[data-clock=expanded]")).toBeHidden();
  await expect(page.locator("#time")).toBeVisible();
  await page.locator("#gear").click();
  await openCategory(page, "status");
  await page.locator('[data-key="date-visibility"]').click();
  await expect(page.locator('[data-key="date:iso"]')).toHaveAttribute("aria-pressed", "true");
  await closeSettings(page);
  await expect(page.locator("#date")).toBeVisible();
  expect(errors).toEqual([]);
});

test("time and date switches hide their formats and keep one remote focus after reload", async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/");
  await page.locator("#gear").click();
  await openCategory(page, "status");
  await page.locator('[data-key="time:24"]').click();
  await page.locator('[data-key="date:iso"]').click();
  const time = page.getByRole("switch", { name: "Show time", exact: true });
  const date = page.getByRole("switch", { name: "Show date", exact: true });
  await time.focus();
  await page.keyboard.press("Enter");
  await expect(time).toBeFocused();
  await expect(page.locator("#time-formats")).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await expect(date).toBeFocused();
  await page.keyboard.press("Space");
  await expect(date).toBeFocused();
  await expect(page.locator("#date-formats")).toBeHidden();
  await expect(page.locator("#time-zone")).toBeHidden();
  await expect(page.locator('#editor [data-key][tabindex="0"]')).toHaveCount(1);
  await closeSettings(page);
  await expect(page.locator("#time")).toBeHidden();
  await expect(page.locator("#date")).toBeHidden();
  await page.reload();
  await page.locator("#gear").click();
  await openCategory(page, "status");
  await time.click();
  await date.click();
  await expect(page.locator('[data-key="time:24"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-key="date:iso"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#time-zone")).toBeVisible();
});
