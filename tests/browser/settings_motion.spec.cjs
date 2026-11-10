const { test, expect } = require("@playwright/test");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  for (const glassSettings of [false, true]) {
    test(`${build} ${glassSettings ? "Glass" : "Classic"} Settings shares motion policy and keeps reduced-motion focus visible`, async ({
      page,
    }, info) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript((glassSettings) => {
        if (!localStorage.getItem("aerotizen.settings.v1")) {
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({ glassSettings, home: ["demo0"], background: "black", showWeather: false }),
          );
        }
      }, glassSettings);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(url);
      await expect(page).toHaveTitle("AeroTizen");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await page.locator("#gear").click();

      const sidebar = page.locator('[data-settings-focus="sidebar"]');
      const content = page.locator('[data-settings-focus="content"]');
      const drawer = page.locator("[data-settings-drawer=frame]");
      const alignment = () =>
        content.evaluate((plate) => {
          const target = document.querySelector('#editor [data-focused="true"]');
          if (!target || plate.dataset.visible !== "true") return Infinity;
          const a = plate.getBoundingClientRect();
          const b = target.getBoundingClientRect();
          return Math.max(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.width - b.width),
            Math.abs(a.height - b.height),
          );
        });
      const expectContentMotion = async () => {
        await expect.poll(alignment).toBeLessThan(1);
        // First positioning snaps; movement between controls keeps the shared duration.
        await expect(content).toHaveAttribute("data-motion", "false");
        await expect(content).toHaveCSS("transition-duration", "0s");
        await page.keyboard.press("ArrowRight");
        await expect(content).toHaveAttribute("data-motion", "true");
        await expect(content).toHaveCSS("transition-duration", "0.15s, 0.1s, 0.12s");
      };
      await expect(sidebar).toHaveCSS("transition-duration", "0.15s, 0.1s");
      await expect(drawer).toHaveCSS("animation-duration", "0.2s");
      await openCategory(page, "appearance");
      await expectContentMotion();
      await expect(page.locator('#editor [data-focused="true"]')).toHaveCSS("transition-duration", "0.1s, 0.1s");

      const expectReduced = async () => {
        const transitions = page.locator("#editor [data-settings-focus], #editor [data-focused=true]");
        const durations = await transitions.evaluateAll((nodes) =>
          nodes.flatMap((node) => getComputedStyle(node).transitionDuration.split(",").map(parseFloat)),
        );
        expect(durations.length).toBeGreaterThan(0);
        expect(durations.every((duration) => duration === 0)).toBe(true);
        await expect(drawer).toHaveCSS("animation-duration", "0s");
        await expect(drawer).toHaveCSS("opacity", "1");
        await expect(page.locator('#editor [data-focused="true"]')).toBeVisible();
      };
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expectReduced();
      await page.locator(`[data-key="settings-appearance:${!glassSettings}"]`).click();
      expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().glassSettings)).toBe(!glassSettings);
      await expectReduced();
      await page.keyboard.press("ArrowDown");
      await expect(content).toHaveAttribute("data-visible", "true");
      await expect(content).toHaveCSS("opacity", "1");
      await expect.poll(alignment).toBeLessThan(1);
      await page.screenshot({ path: info.outputPath("reduced-motion-settings.png") });
      await closeSettings(page);
      await page.reload();
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await page.locator("#gear").click();
      await expectReduced();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(sidebar).toHaveCSS("transition-duration", "0.15s, 0.1s");
      await expect(drawer).toHaveCSS("animation-duration", "0.2s");
      await openCategory(page, "appearance");
      await expectContentMotion();
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
