const { test, expect } = require("./launcher_fixture.cjs");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} entry boots Home and Settings without legacy views or load errors`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript(() => {
      // Count preference subscriptions from the moment the entry publishes its service.
      window.AeroTizen ||= {};
      window.preferenceSourceSubscriptions = 0;
      let source;
      Object.defineProperty(window.AeroTizen, "settings", {
        get: () => source,
        set(value) {
          if (value === source) return;
          source = value;
          const subscribe = value.subscribe;
          value.subscribe = (listener) => {
            window.preferenceSourceSubscriptions++;
            const unsubscribe = subscribe(listener);
            return () => {
              window.preferenceSourceSubscriptions--;
              unsubscribe();
            };
          };
        },
      });
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["demo0", "demo1"], background: "black", showWeather: false }),
      );
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    expect(
      await page.evaluate(() => ({
        tiles: typeof AeroTizen.tiles,
        artwork: typeof AeroTizen.artwork,
        catalogue: typeof AeroTizen.catalog,
        watcherDispose: typeof AeroTizen.homewatch.dispose,
      })),
    ).toEqual({ tiles: "undefined", artwork: "undefined", catalogue: "undefined", watcherDispose: "function" });
    for (const script of [
      "app-catalog.js",
      "app-lookup.js",
      "artwork.js",
      "brands.js",
      "config.js",
      "dom.js",
      "homewatch.js",
      "main.js",
    ]) {
      await expect(page.locator('script[src$="/' + script + '"]')).toHaveCount(0);
    }
    await expect(page.locator("#home-root #grid > [data-id]")).toHaveCount(2);
    await expect(page.locator("#home-root #grid > [data-id]").first()).toHaveAttribute("data-focused", "true");
    await page.locator("#gear").click();
    await expect(page.locator("#settings-root #editor")).toBeVisible();
    await page.locator('[data-key="section:appearance"]').click();
    const componentCss = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets).filter(
        (sheet) =>
          sheet.href?.endsWith("/js/launcher-ui.css") ||
          sheet.ownerNode?.getAttribute?.("data-vite-dev-id")?.endsWith(".module.css"),
      );
      const selectors = [];
      const nested = [];
      const visit = (rules) => {
        for (const rule of rules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            selectors.push(rule.selectorText);
            if (rule.cssRules?.length) nested.push(rule.selectorText);
          } else if (rule.cssRules) {
            visit(rule.cssRules);
          }
        }
      };
      for (const sheet of sheets) visit(sheet.cssRules);
      return { sheets: sheets.length, selectors, nested };
    });
    expect(componentCss.sheets).toBeGreaterThan(0);
    expect(componentCss.selectors.some((selector) => selector.includes("#editor"))).toBe(false);
    expect(componentCss.nested, "Chromium 69 receives flattened CSS in development and production").toEqual([]);

    const standalone = await page
      .locator('#settings-appearance, #settings-appearance [data-focused="true"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const properties = node.hasAttribute("data-key")
            ? ["background", "border", "border-radius", "padding", "height", "color", "outline", "transform"]
            : ["display", "flex-wrap", "gap", "margin-bottom"];
          const read = (element) => {
            const style = getComputedStyle(element);
            return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
          };
          const inside = read(node);
          const clone = node.cloneNode(true);
          clone.removeAttribute("id");
          clone.removeAttribute("data-key");
          clone.style.position = "fixed";
          document.body.appendChild(clone);
          try {
            return { inside, outside: read(clone) };
          } finally {
            clone.remove();
          }
        }),
      );
    expect(standalone).toHaveLength(2);
    for (const control of standalone) expect(control.outside).toEqual(control.inside);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    // UI and TV services share this owner. Reopening Settings must not retain listeners.
    const subscriptions = await page.evaluate(() => window.preferenceSourceSubscriptions);
    expect(subscriptions).toBeGreaterThan(0);
    for (let reopen = 0; reopen < 2; reopen++) {
      await page.locator("#gear").click();
      await expect(page.locator("#editor")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.locator("#editor")).toBeHidden();
      expect(await page.evaluate(() => window.preferenceSourceSubscriptions)).toBe(subscriptions);
    }
    expect(await page.evaluate(() => typeof AeroTizen.inputs.render)).toBe("undefined");
    expect(
      await page.evaluate(() =>
        Array.from(document.scripts, (script) => script.src && new URL(script.src).pathname).filter((file) =>
          /\/(?:settings|settings-ui|home-screen|continue-row|clock-layouts)\.js$/.test(file),
        ),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test.describe("automatic development preview", () => {
  test.use({ previewPlatforms: false });
  test("local development opens the full preview and preserves settings with or without the old query", async ({
    page,
  }) => {
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.goto("http://127.0.0.1:8172/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    const grid = page.locator("#grid");
    const apps = grid.locator("> [data-id]");
    const cards = page.locator("#continue-items > [data-key]");
    await expect(page.locator("body")).toHaveClass(/\bglass-ui\b/);
    await expect(grid).toHaveAttribute("data-columns", "5");
    await expect(grid).toHaveAttribute("data-scroll", "true");
    await expect(apps).toHaveCount(6);
    await expect(apps.nth(4)).toHaveAccessibleName("Apple TV");
    await expect(apps.last()).toHaveAccessibleName("Stremio");
    await expect(page.locator("#continue-section")).toBeVisible();
    await expect(cards).toHaveCount(7);
    await expect(
      page.locator("[data-continue-part=source-badge] :is([data-app-artwork], [data-app-fallback]):visible"),
    ).toHaveCount(7);
    await page.locator("#home-tab").click();
    await page.keyboard.press("ArrowDown");
    await expect(apps.first()).toBeFocused();
    for (let index = 0; index < 5; index++) await page.keyboard.press("ArrowRight");
    await expect(apps.last()).toBeFocused();
    await expect.poll(async () => Number(await grid.getAttribute("data-offset"))).toBeGreaterThan(0);
    for (const glass of [false, true]) {
      await page.evaluate((glass) => AeroTizen.settings.update({ glassSettings: glass }), glass);
      await page.waitForFunction((glass) => document.body.classList.contains("glass-ui") === glass, glass);
      const fill = await page
        .locator("#grid > [data-id]")
        .first()
        .evaluate((node) => getComputedStyle(node).background);
      for (const badge of await page.locator("[data-continue-part=source-badge]").all()) {
        await expect(badge).toHaveCSS("background", fill);
      }
    }
    await expect(page.locator("[data-continue-part=progress-fill]")).toHaveCount(6);
    const unplayed = page.getByRole("button", { name: "Paper Moons · Prime Video" });
    await expect(unplayed.locator("[data-continue-part=progress-fill]")).toHaveCount(0);
    const labelBackground = await unplayed
      .locator("[data-continue-part=label]")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await expect(unplayed.locator("[data-continue-part=progress]")).toHaveCSS("background-color", labelBackground);
    const longTitle = page
      .getByRole("button", { name: /Signal North and the Last Broadcast/ })
      .locator("[data-continue-part=title]");
    expect(await longTitle.evaluate((node) => node.clientHeight === 60 && node.scrollHeight > node.clientHeight)).toBe(
      true,
    );
    const heights = await cards.evaluateAll((nodes) => nodes.map((card) => card.offsetHeight));
    expect(heights).toEqual(Array(7).fill(318));
    await expect(page.locator("[data-continue-part=image]").first()).toHaveJSProperty("complete", true);
    expect(
      await page
        .locator("[data-continue-part=image]")
        .first()
        .evaluate((image) => image.naturalWidth),
    ).toBeGreaterThan(0);
    await page.evaluate(() => AeroTizen.settings.update({ timeFormat: "24" }));
    const saved = await page.evaluate(() => localStorage.getItem(AeroTizen.config.STORAGE_KEY));
    await page.goto("http://127.0.0.1:8172/?demo=1");
    await expect(cards).toHaveCount(7);
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().timeFormat)).toBe("24");
    expect(await page.evaluate(() => localStorage.getItem(AeroTizen.config.STORAGE_KEY))).toBe(saved);
  });
});
