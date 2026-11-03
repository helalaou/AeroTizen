const { test, expect } = require("@playwright/test");
test("Glass categories support D-pad, Back/Left, single focus plate, wallpaper browsing and Samsung escape", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1"))
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          glassSettings: true,
          background: "black",
          showWeather: false,
          home: ["demo0", "demo1", "demo2"],
        }),
      );
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  const checkTabPlate = async () =>
    expect
      .poll(() =>
        page.locator(".header-focus-indicator--tabs").evaluate((plate) => {
          const target = document.querySelector("#home-tab"),
            a = plate.getBoundingClientRect(),
            b = target.getBoundingClientRect();
          return Math.max(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.width - b.width),
            Math.abs(a.height - b.height),
          );
        }),
      )
      .toBeLessThan(2);
  await checkTabPlate();
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toHaveClass(/settings-drawer--collapsed/);
  await expect(page.locator('[data-key="section:appearance"]')).toHaveClass(/focused/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="section:apps"]')).toHaveClass(/focused/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-section-pane="apps"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#editor")).toHaveClass(/settings-drawer--collapsed/);
  for (const category of ["appearance", "apps", "wallpaper", "status", "sources"]) {
    await page.locator(`[data-key="section:${category}"]`).click();
    await expect(page.locator(`[data-section-pane="${category}"]`)).toBeVisible();
    await expect(page.locator("#editor .focused")).toHaveCount(1);
    await expect(page.locator(".settings-focus-indicator--content")).toHaveClass(/is-visible/);
    const current = page.locator("#editor .focused");
    expect(await current.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
    await expect
      .poll(() =>
        page.locator(".settings-focus-indicator--content").evaluate((plate) => {
          const target = document.querySelector("#editor .focused"),
            a = plate.getBoundingClientRect(),
            b = target.getBoundingClientRect();
          return Math.max(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.width - b.width),
            Math.abs(a.height - b.height),
          );
        }),
      )
      .toBeLessThan(2);
    await page.screenshot({ path: info.outputPath("glass-" + category + ".png") });
  }
  await page.locator('[data-key="section:wallpaper"]').click();
  const before = await page.evaluate(() => JSON.stringify(AeroTizen.settings));
  for (const filter of ["photo", "solid", "gradient", "animated"])
    await page.locator(`[data-key="wallpaper-categories:${filter}"]`).click();
  expect(await page.evaluate(() => JSON.stringify(AeroTizen.settings))).toBe(before);
  await page.locator('[data-key="section:apps"]').click();
  await page.evaluate(() => {
    window.escapeCount = 0;
    AeroTizen.homewatch.openSamsungHome = () => window.escapeCount++;
  });
  await page.locator("#escape").click();
  expect(await page.evaluate(() => window.escapeCount)).toBe(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("#editor")).toBeHidden();
  await page.reload();
  expect(await page.evaluate(() => AeroTizen.settings.glassSettings)).toBe(true);
  await checkTabPlate();
  expect(errors).toEqual([]);
});

for (const glass of [false, true])
  for (const height of [720, 1080]) {
    test(`${glass ? "Glass" : "Classic"} Settings bounds and remote focus at ${height}p`, async ({ page }) => {
      await page.setViewportSize({ width: height === 720 ? 1280 : 1920, height });
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript(
        (glass) =>
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({ glassSettings: glass, background: "black", showWeather: false }),
          ),
        glass,
      );
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.ready);
      await page.locator("#gear").click();
      // Check authored longhands as well as geometry: inset is unavailable on Chromium 69.
      const bounds = await page.locator("#editor").evaluate((el) => {
        const rule = Array.from(document.styleSheets)
          .flatMap((sheet) => Array.from(sheet.cssRules))
          .find((rule) => rule.selectorText && el.matches(rule.selectorText) && rule.style.position === "fixed");
        const rect = el.getBoundingClientRect();
        return {
          sides: ["top", "right", "bottom", "left"].map((side) => rule.style[side]),
          width: rect.width,
          height: rect.height,
        };
      });
      expect(bounds.sides).toEqual(["0px", "0px", "0px", "0px"]);
      expect(bounds.width).toBe(height === 720 ? 1280 : 1920);
      expect(bounds.height).toBe(height);
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
      await expect(page.locator('[data-key="section:sources"]')).toHaveClass(/focused/);
      await page.keyboard.press("ArrowRight");
      for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowDown");
      const visible = await page.locator("#editor .focused").evaluate((el) => {
        const r = el.getBoundingClientRect(),
          host = el.closest(".settings-drawer__scroll") || el.closest(".settings-drawer__main"),
          h = host.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= h.top && r.bottom <= h.bottom && r.right <= innerWidth;
      });
      expect(visible).toBe(true);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.locator("#editor")).toBeHidden();
    });
  }
