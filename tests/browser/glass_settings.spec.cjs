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
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  const checkTabPlate = async () =>
    expect
      .poll(() =>
        page.locator("[data-header-focus=tabs]").evaluate((plate) => {
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
  await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "false");
  await expect(page.locator('[data-key="section:appearance"]')).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="section:apps"]')).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-section-pane="apps"]')).toBeVisible();
  const paneScroll = page.locator("[data-settings-drawer=scroll]");
  const scrollToEnd = (node) => (node.scrollTop = node.scrollHeight);
  expect(await paneScroll.evaluate(scrollToEnd)).toBeGreaterThan(0);
  await page.locator('[data-key="section:sources"]').click();
  await expect(paneScroll).toHaveJSProperty("scrollTop", 0);
  await page.locator('[data-key="section:wallpaper"]').click();
  await expect(paneScroll).toHaveJSProperty("scrollTop", 0);
  await page.locator('[data-key="section:apps"]').click();
  await expect(paneScroll).toHaveJSProperty("scrollTop", 0);
  await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute("data-key", "add");
  expect(await paneScroll.evaluate(scrollToEnd)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await expect(paneScroll).toHaveJSProperty("scrollTop", 0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "false");
  for (const category of ["appearance", "apps", "wallpaper", "status", "weather", "sources"]) {
    await page.locator(`[data-key="section:${category}"]`).click();
    await expect(page.locator(`[data-section-pane="${category}"]`)).toBeVisible();
    await expect(page.locator("#editor [data-focused=true]")).toHaveCount(1);
    await expect(page.locator("[data-settings-focus=content]")).toHaveAttribute("data-visible", "true");
    const current = page.locator("#editor [data-focused=true]");
    expect(await current.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
    await expect
      .poll(() =>
        page.locator("[data-settings-focus=content]").evaluate((plate) => {
          const target = document.querySelector("#editor [data-focused=true]"),
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
  const before = await page.evaluate(() => JSON.stringify(AeroTizen.settings.getSnapshot()));
  for (const filter of ["photo", "solid", "gradient", "animated"])
    await page.locator(`[data-key="wallpaper-categories:${filter}"]`).click();
  expect(await page.evaluate(() => JSON.stringify(AeroTizen.settings.getSnapshot()))).toBe(before);
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
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().glassSettings)).toBe(true);
  await checkTabPlate();
  expect(errors).toEqual([]);
});

for (const language of ["en", "ar"])
  for (const glass of [false, true]) {
    test(`${language} ${glass ? "Glass" : "Classic"} native focus and rapid keys open the focused category`, async ({
      page,
    }) => {
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript(
        ({ language, glass }) => {
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({ language, glassSettings: glass, background: "black", showWeather: false }),
          );
        },
        { language, glass },
      );
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await page.locator("#gear").click();
      const into = language === "ar" ? "ArrowLeft" : "ArrowRight";
      for (const [category, key] of [
        ["apps", into],
        ["language", "Enter"],
        ["about", "Space"],
      ]) {
        const entry = page.locator(`[data-key="section:${category}"]`);
        // Native focus (including focus restoration) can precede the drawer's next render.
        await entry.focus();
        await expect(entry).toHaveAttribute("data-focused", "true");
        await page.keyboard.press(key);
        await expect(page.locator(`[data-section-pane="${category}"]`)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-settings-drawer="frame"]')).toHaveAttribute("data-expanded", "false");
      }
      await page.locator('[data-key="section:appearance"]').focus();
      // Deliver a remote sequence in one task, without waiting for a browser frame.
      await page.evaluate(() => {
        const { KEY } = AeroTizen.config;
        AeroTizen.settingsUi.keydown(KEY.DOWN, { preventDefault() {} });
        AeroTizen.settingsUi.keydown(document.documentElement.dir === "rtl" ? KEY.LEFT : KEY.RIGHT, {
          preventDefault() {},
        });
      });
      await expect(page.locator('[data-section-pane="apps"]')).toBeVisible();
    });

    test(`${language} ${glass ? "Glass" : "Classic"} Settings bounds and remote focus at 1080p`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.addInitScript(
        ({ glass, language }) =>
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({ glassSettings: glass, language, background: "black", showWeather: false }),
          ),
        { glass, language },
      );
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
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
      expect(bounds.width).toBe(1920);
      expect(bounds.height).toBe(1080);
      const enterPane = language === "ar" ? "ArrowLeft" : "ArrowRight";
      const sidebar = page.locator("[data-settings-drawer=sidebar]");
      const menu = sidebar.locator("[data-settings-drawer=menu]");
      expect(await menu.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
      const sidebarWidth = (await sidebar.boundingBox()).width;
      const categoryWidth = (await page.locator('[data-key="section:appearance"]').boundingBox()).width;
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
      const footer = page.locator("#escape");
      await expect(footer).toBeFocused();
      await expect(footer).toBeInViewport();
      expect(await menu.evaluate((el) => el.scrollTop)).toBe(0);
      await page.keyboard.press(enterPane);
      await expect(footer).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(page.locator('[data-key="section:about"]')).toHaveAttribute("data-focused", "true");
      await page.keyboard.press("ArrowUp");
      await expect(page.locator('[data-key="section:language"]')).toHaveAttribute("data-focused", "true");
      await page.keyboard.press("ArrowUp");
      await expect(page.locator('[data-key="section:sources"]')).toHaveAttribute("data-focused", "true");
      await page.keyboard.press(enterPane);
      await expect(page.locator('[data-section-pane="sources"]')).toBeVisible();
      expect((await sidebar.boundingBox()).width).toBe(sidebarWidth);
      expect((await page.locator('[data-key="section:appearance"]').boundingBox()).width).toBe(categoryWidth);
      for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowDown");
      const visible = await page.locator("#editor [data-focused=true]").evaluate((el) => {
        const r = el.getBoundingClientRect(),
          host = el.closest("[data-settings-drawer=scroll]") || el.closest("[data-settings-drawer=main]"),
          h = host.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= h.top && r.bottom <= h.bottom && r.right <= innerWidth;
      });
      expect(visible).toBe(true);
      const close = page.locator('[data-key="settings-close"]');
      await close.focus();
      await expect(close).toHaveAttribute("data-focused", "true");
      await expect(close).toHaveCSS("outline-style", "solid");
      await expect(close).toHaveCSS("outline-width", "2px");
      await page.keyboard.press("Enter");
      await expect(page.locator("#editor")).toBeHidden();
    });
  }
