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

test("first-row navigation does not format the clock or measure layout", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => AeroTizen.apps.getSnapshot().ready && document.querySelector("#grid [data-focused=true]"),
  );
  const result = await page.evaluate(() => {
    const calls = { format: 0, rect: 0 };
    const originals = new Map();
    for (const name of ["formatTime", "formatTimeParts", "formatDate", "measureTime", "defaultTimeFormat"]) {
      const original = AeroTizen.clock[name];
      originals.set(name, original);
      AeroTizen.clock[name] = (...args) => {
        calls.format++;
        return original(...args);
      };
    }
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      calls.rect++;
      return rect.call(this);
    };
    const keys = [];
    try {
      for (let i = 0; i < 30; i++) {
        AeroTizen.homeScreen.keydown(i % 2 ? 37 : 39, { preventDefault() {} });
        keys.push(document.querySelector("#grid [data-focused=true]").getAttribute("data-id"));
      }
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      for (const [name, original] of originals) AeroTizen.clock[name] = original;
    }
    return { calls, keys: [...new Set(keys)] };
  });
  expect(result.keys.sort()).toEqual(["demo0", "demo1"]);
  expect(result.calls).toEqual({ format: 0, rect: 0 });
});

for (const theme of ["classic", "glass"]) {
  test(`performance mode persists and stops wallpapers and UI transitions in ${theme}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    await page.evaluate((theme) => AeroTizen.settings.update({ theme }), theme);
    const blob = page.locator("[data-background-blob]").first();
    await expect(blob).not.toHaveCSS("animation-name", "none");
    await page.locator("#gear").click();
    await openCategory(page, "appearance");
    await page.locator('[data-key="performance-mode:true"]').click();
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
    await page.screenshot({ path: info.outputPath("performance-mode-home.png") });
    await page.locator("#gear").click();
    await openCategory(page, "appearance");
    await expect(page.locator('[data-key="performance-mode:true"]')).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: info.outputPath("performance-mode-settings.png") });
    // All animated wallpaper families must stop work, including WebGL loops.
    for (const background of ["waves", "stars", "nebula", "rain"]) {
      await page.evaluate((background) => {
        AeroTizen.settings.update({ background });
        AeroTizen.applyBackground();
      }, background);
      await expect(page.locator("[data-background-host] canvas")).toHaveCount(0);
      expect(
        await page.locator("[data-background-host]").evaluate((host) => host.getAnimations({ subtree: true }).length),
      ).toBe(0);
    }
    await page.evaluate(() => {
      AeroTizen.settings.update({ background: "aurora" });
      AeroTizen.applyBackground();
    });
    await page.locator('[data-key="performance-mode:false"]').click();
    await expect(blob).not.toHaveCSS("animation-name", "none");
    await closeSettings(page);
    await expect(page.locator("#grid > [data-id]").first()).toHaveCSS("transition-duration", "0.15s");
    expect(errors).toEqual([]);
  });
}
