const { test, expect } = require("@playwright/test");

for (const glass of [false, true]) {
  test(`weather photos stay behind the unfocused ${glass ? "Glass" : "Classic"} header and viewport`, async ({
    page,
  }) => {
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript(
      (glassSettings) =>
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            home: ["demo0"],
            background: "black",
            showWeather: false,
            showNetwork: true,
            clockLayout: "classic",
            glassSettings,
          }),
        ),
      glass,
    );
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.ready);
    await expect(page.locator("#gear")).not.toHaveClass(/focused/);
    await page.evaluate(() => {
      const now = Date.now();
      window.Weather.currentReading = () => ({
        code: 3,
        at: now,
        solar: [{ sunrise: now - 3600000, sunset: now + 3600000 }],
      });
      AeroTizen.settings.weatherPhoto = true;
      AeroTizen.applyBackground();
    });
    const photo = page.locator("#weather-photo");
    await expect(photo).toHaveClass(/scene-cloud/);
    // Enable hit testing to detect paint-order occlusion.
    await photo.evaluate((layer) => (layer.style.pointerEvents = "auto"));
    for (const selector of ["#gear", "#network", "#home-tab", "#apps-tab", "#time", ".content-viewport"]) {
      const exposed = await page.locator(selector).evaluate((element) => {
        const r = element.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return target !== null && element.contains(target);
      });
      expect(exposed, `${selector} must paint above the wallpaper without focus`).toBe(true);
    }
    await page.locator("#gear").click();
    await expect(page.locator("#editor")).toBeVisible();
    await expect(page.locator(".topbar")).toHaveCSS("visibility", "visible");
    await expect(page.locator(".topbar")).toHaveCSS("opacity", "0.48");
    await page.keyboard.press("Escape");
    await expect(page.locator(".topbar")).toHaveCSS("visibility", "visible");
    await page.evaluate(() => document.body.classList.add("tv"));
    await expect(page.locator(".topbar")).toHaveCSS("visibility", "hidden");
    await expect(page.locator("#weather-photo")).toHaveCSS("display", "none");
  });
}
