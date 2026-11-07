const { test, expect } = require("@playwright/test");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  for (const glassSettings of [false, true]) {
    test(`${build} ${glassSettings ? "Glass" : "Classic"} runtime overlays keep stacking, motion and icon direction`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript((glassSettings) => {
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({ glassSettings, home: ["__fire"], background: "black", showWeather: false, language: "en" }),
        );
      }, glassSettings);
      await page.clock.install();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(url);
      await expect(page).toHaveTitle("AeroTizen");
      const tile = page.getByRole("button", { name: "Fireplace", exact: true });
      await expect(tile).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#fireplace")).toBeVisible();
      const volume = page.locator("#fire-volume");
      await expect(volume).toHaveCSS("transition-duration", "0.2s");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(volume).toHaveCSS("transition-duration", "0s");
      await page.keyboard.press("ArrowUp");
      await expect(volume).toHaveText("Volume 7");
      await expect(volume).toHaveCSS("opacity", "1");
      await page.evaluate(() => AeroTizen.toast("Overlay message"));
      const toast = page.locator("#toast");
      await expect(toast).toHaveText("Overlay message");
      expect(
        await toast.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node;
        }),
      ).toBe(true);
      await page.clock.runFor(1600);
      await expect(volume).toHaveCSS("opacity", "0");
      await expect(toast).toBeVisible();
      await page.clock.runFor(1000);
      await expect(toast).toBeHidden();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(volume).toHaveCSS("transition-duration", "0.2s");
      await page.keyboard.press("Escape");
      await expect(tile).toBeFocused();
      await page.locator("#gear").click();
      const arrow = page.locator('[data-key="section:appearance"] .lucide-chevron-right');
      await expect(arrow).toHaveCSS("transform", "none");
      await page.evaluate(() => {
        AeroTizen.settings.update({ language: "ar" });
      });
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(arrow).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
      await expect(page.locator("[data-settings-help] .lucide-chevron-left")).toHaveCSS(
        "transform",
        "matrix(-1, 0, 0, 1, 0, 0)",
      );
      await expect(page.locator(".focused")).toHaveCount(0);
      await expect(page.locator("#editor [data-focused=true]")).toHaveCount(1);
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
