const { test, expect } = require("./launcher_fixture.cjs");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0", "demo1", "demo2"],
          background: "aurora",
          showWeather: false,
        }),
      );
    }
  });
});
const theme = "glass";
test(`performance mode persists and stops wallpapers and UI transitions in ${theme}`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate((theme) => AeroTizen.settings.update({ theme }), theme);
  const blob = page.locator("[data-background-blob]").first();
  await expect(blob).not.toHaveCSS("animation-name", "none");
  await page.locator("#gear").click();
  await openCategory(page, "appearance");
  await page.locator('[data-key="performance-mode"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-performance-mode", "true");
  await expect(blob).toHaveCSS("animation-name", "none");
  await expect(blob).toHaveCSS("will-change", "auto");
  await closeSettings(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('#grid > [data-id="demo1"]')).toBeFocused();
  await expect(page.locator('#grid > [data-id="demo1"]')).toHaveCSS("transition-duration", "0s");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-performance-mode", "true");
  await expect(blob).toHaveCSS("animation-name", "none");
  await expect(page).toHaveTitle("AeroTizen");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.locator("#gear").click();
  await openCategory(page, "appearance");
  await expect(page.locator('[data-key="performance-mode"]')).toHaveAttribute("aria-checked", "true");
  await page.locator('[data-key="performance-mode"]').click();
  await expect(blob).not.toHaveCSS("animation-name", "none");
  await closeSettings(page);
  await expect(page.locator("#grid > [data-id]").first()).toHaveCSS("transition-duration", "0.15s");
  expect(errors).toEqual([]);
});
