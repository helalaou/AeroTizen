const { test, expect } = require("@playwright/test");

const { closeSettings, openCategory } = require("./drawer_helpers.cjs");

for (const glassSettings of [false, true]) {
  test.describe(glassSettings ? "Italian Glass" : "Italian Classic", () => {
    test.use({ locale: "it-IT" });
    test("automatic and manual language choices preserve focus and survive reload", async ({ page }, info) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript((glass) => {
        if (!localStorage.getItem("aerotizen.settings.v1")) {
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({ glassSettings: glass, language: "auto", background: "black", showWeather: false }),
          );
        }
      }, glassSettings);
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await expect(page.locator("#apps-tab")).toContainText("Tutte le app");
      await page.locator("#gear").click();
      await openCategory(page, "language");
      await expect(page.locator('[data-key="language:it"]')).toContainText("Italiano");
      await page.locator('[data-key="language:en"]').click();
      await expect(page.locator('[data-key="language:auto"]')).toContainText("Use TV language");
      await page.locator('[data-key="language:it"]').click();
      await expect(page.locator('[data-key="language:auto"]')).toContainText("Usa la lingua della TV");
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator("#editor [data-focused=true]")).toBeVisible();
      await closeSettings(page);
      await page.reload();
      await expect(page.locator("#apps-tab")).toContainText("Tutte le app");
      await page.locator("#gear").click();
      await openCategory(page, "language");
      await expect(page.locator('[data-key="language:it"]')).toHaveAttribute("aria-pressed", "true");
      await page.locator('[data-key="language:auto"]').click();
      await closeSettings(page);
      await page.locator("#gear").click();
      for (const category of ["appearance", "status", "sources", "weather", "wallpaper", "apps", "about"]) {
        await openCategory(page, category);
        await expect(page.locator(`[data-section-pane="${category}"]`)).toBeVisible();
        if (category === "appearance") {
          const labels = page.locator("#home-card-columns span, #home-app-layout span");
          await expect(labels).toHaveText(["Piccola", "Media", "Grande", "Griglia", "Scorrimento"]);
          await expect
            .poll(() =>
              labels.evaluateAll((elements) =>
                elements.every(
                  (element) =>
                    element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth,
                ),
              ),
            )
            .toBe(true);
        }
        await page.screenshot({ path: info.outputPath(category + ".png") });
        await page.keyboard.press("Escape");
      }
      expect(errors).toEqual([]);
    });
  });
}
