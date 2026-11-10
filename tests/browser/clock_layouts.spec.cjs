const { openCategory, closeSettings } = require("./drawer_helpers.cjs");
const { test, expect } = require("@playwright/test");

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
  await page.locator('[data-key="date:none"]').click();
  await closeSettings(page);
  await expect(page.locator("[data-clock-part=date]")).toBeHidden();
  await page.reload();
  await expect(page.locator("[data-clock=expanded]")).toHaveAttribute("data-clock-layout", "bold");
  expect(
    await page.evaluate(() => [
      AeroTizen.settings.getSnapshot().timeFormat,
      AeroTizen.settings.getSnapshot().dateFormat,
    ]),
  ).toEqual(["24", "none"]);
  await page.locator("#gear").click();
  await openCategory(page, "status");
  await page.locator('[data-key="clock-layouts:classic"]').click();
  await closeSettings(page);
  await expect(page.locator("[data-clock=expanded]")).toBeHidden();
  await expect(page.locator("#time")).toBeVisible();
  expect(errors).toEqual([]);
});
