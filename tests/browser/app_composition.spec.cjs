const { test, expect } = require("@playwright/test");

test("an unset Home list and a saved empty list preserve their distinct views and focus", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => {
    AeroTizen.settings.update({ home: null });
  });
  await expect(page.locator("#grid > [data-id]")).toHaveCount(1);
  await expect(page.locator("#grid > [data-id]")).toHaveAttribute("data-id", "__fire");
  await page.evaluate(() => {
    AeroTizen.settings.update({ home: [] });
  });
  await expect(page.locator("#grid > [data-id]")).toHaveCount(0);
  await expect(page.locator("#inputs > [data-input-card]").first()).toHaveAttribute("data-focused", "true");
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#editor")).toBeHidden();
  await expect(page.locator("#grid > [data-id]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
