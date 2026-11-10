const { test, expect } = require("@playwright/test");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  for (const glassSettings of [false, true]) {
    test(`${build} ${glassSettings ? "Glass" : "Classic"} inputs keep status, remote focus and live reduced-motion preferences`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript(
        (glassSettings) =>
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({
              glassSettings,
              home: ["demo0"],
              background: "black",
              showWeather: false,
              inputNames: {
                "HDMI 1": "Xbox",
                "HDMI 2": "PC",
                "HDMI 3": "Pinned streaming box",
                "HDMI 4": "Disconnected console",
              },
            }),
          ),
        glassSettings,
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(url);
      await expect(page).toHaveTitle("AeroTizen");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await page.evaluate(() => {
        const inputSnapshot = AeroTizen.inputs.getSnapshot();
        const sources = [
          { type: "HDMI", number: 1, connected: false, active: true },
          { type: "HDMI", number: 2, connected: false },
          { type: "HDMI", number: 3, connected: false },
          { type: "HDMI", number: 4, connected: false },
          { type: "HDMI", number: 5, connected: true },
          { type: "TV", number: 0, connected: true },
        ];
        AeroTizen.inputs.isVisible = () => true;
        AeroTizen.inputs.hasRecognizedDevice = (source) => source.number === 2;
        AeroTizen.inputs.alwaysVisible = (source) => source.number === 3;
        AeroTizen.inputs.getSnapshot = () => ({ ...inputSnapshot, sources, visibleSources: sources });
        AeroTizen.homeScreen.render();
      });
      const cards = page.locator("#inputs > [data-input-card]");
      await expect(cards).toHaveCount(6);
      expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.status))).toEqual([
        "active",
        "recognized",
        "pinned",
        "empty",
        "connected",
        "live",
      ]);
      await expect(cards.first()).toHaveCSS("transition-duration", glassSettings ? "0.15s, 0.15s" : "0.15s");
      await page.locator("#home-tab").click();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (let i = 0; i < 6; i++) {
        if (i) await page.keyboard.press("ArrowRight");
        const card = cards.nth(i);
        await expect(card).toBeFocused();
        await expect(card).toHaveAttribute("data-focused", "true");
        const durations = await card.evaluate((node) =>
          getComputedStyle(node).transitionDuration.split(",").map(parseFloat),
        );
        expect(durations.every((duration) => duration === 0)).toBe(true);
        expect(await card.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
        await expect(card).toHaveCSS("opacity", !glassSettings && i === 3 ? "0.8" : "1");
        if (glassSettings && i < 4) {
          await expect(card.locator("[data-input-part=subtitle]")).toHaveCSS(
            "color",
            i === 3 ? "rgba(255, 255, 255, 0.88)" : "rgba(255, 255, 255, 0.83)",
          );
        }
        await expect
          .poll(() => card.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a))
          .toBeCloseTo(glassSettings ? 1.015 : 1.035, 3);
      }
      await page.evaluate((glassSettings) => {
        AeroTizen.settings.update({ glassSettings: !glassSettings });
      }, glassSettings);
      await expect(cards.last()).toBeFocused();
      await expect(cards.last()).toHaveCSS("transition-duration", glassSettings ? "0s" : "0s, 0s");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(cards.last()).toHaveCSS("transition-duration", glassSettings ? "0.15s" : "0.15s, 0.15s");
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
