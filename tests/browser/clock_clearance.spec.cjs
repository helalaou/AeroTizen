const { test, expect } = require("@playwright/test");
const { compareHeaderPixels } = require("./compare_header_pixels.cjs");
for (const glassSettings of [false, true]) {
  for (const style of ["vertical", "horizontal", "minimal", "bold"]) {
    test(`${glassSettings ? "Glass" : "Classic"} ${style} clock clears focused apps, centres tabs and fades only scrolled content`, async ({
      page,
    }, info) => {
      await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
      await page.addInitScript(
        ({ glassSettings, style }) => {
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({
              glassSettings,
              clockLayout: "custom",
              aeroClockStyle: style,
              home: Array.from({ length: 12 }, (_, i) => "demo" + i),
              background: "black",
              showWeather: true,
            }),
          );
          localStorage.setItem(
            "aerotizen.weather.v2",
            JSON.stringify({
              temp: 20,
              code: 3,
              day: 1,
              at: Date.parse("2026-10-29T10:20:00Z"),
              unit: "C",
              source: "auto",
              city: "A very long fixture city name",
            }),
          );
        },
        { glassSettings, style },
      );
      await page.clock.setFixedTime(new Date("2026-10-29T10:20:00Z"));
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.ready);
      await expect(page.locator(".weather-status__location")).toBeVisible();
      await expect(page.locator("#rows")).toHaveCSS("padding-top", "24px");
      const measure = () =>
        page.evaluate(() => {
          const city = document.querySelector(".clock--expanded").getBoundingClientRect();
          const card = document.querySelector("#grid .tile.focused").getBoundingClientRect();
          const tabs = document.querySelector(".view-tabs").getBoundingClientRect();
          return { gap: card.top - city.bottom, centre: tabs.left + tabs.width / 2 };
        });
      await expect.poll(async () => (await measure()).gap).toBeGreaterThan(35);
      expect((await measure()).centre).toBeCloseTo(960, 0);
      const headerHeight = await page
        .locator(".topbar")
        .evaluate((n) => Math.floor(Math.min(n.getBoundingClientRect().height - 1, 350)));
      const headerBounds = await page.locator(".topbar").boundingBox();
      const headerBefore = await page.screenshot();
      await page.screenshot({ path: info.outputPath("clock-clearance.png") });
      await expect(page.locator(".content-viewport")).not.toHaveClass(/is-scrolled/);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(page.locator(".content-viewport")).toHaveClass(/is-scrolled/);
      expect(await page.locator(".weather-status__location").textContent()).toContain("fixture city");
      const headerAfter = await page.screenshot();
      const difference = await compareHeaderPixels(page, headerBefore, headerAfter, headerHeight);
      expect(
        difference.changedPixels,
        "the scrolled viewport must not fade the header: " + JSON.stringify(difference),
      ).toBe(0);
      expect(await page.locator(".topbar").boundingBox()).toEqual(headerBounds);
      await page.screenshot({ path: info.outputPath("scroll-fade.png") });
      expect(await page.locator(".content-viewport").evaluate((n) => getComputedStyle(n).webkitMaskImage)).toContain(
        "linear-gradient",
      );
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await expect(page.locator(".content-viewport")).not.toHaveClass(/is-scrolled/);
    });
  }
}

for (const [change, css] of [
  ["fading", "opacity: .95"],
  ["movement", "transform: translateX(4px)"],
]) {
  test("header comparison detects " + change + " beyond text rendering variance", async ({ page }) => {
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.clock.setFixedTime(new Date("2026-10-29T10:20:00Z"));
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.ready);
    const height = await page.locator(".topbar").evaluate((node) => Math.floor(node.getBoundingClientRect().height));
    const before = await page.screenshot();
    await page.addStyleTag({ content: ".topbar { " + css + " }" });
    const after = await page.screenshot();
    const difference = await compareHeaderPixels(page, before, after, height);
    expect(difference.changedPixels).toBeGreaterThan(0);
  });
}
