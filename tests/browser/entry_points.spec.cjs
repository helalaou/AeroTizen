const { test, expect } = require("@playwright/test");

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
    await page.route("**/js/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          `
          window.preferenceSourceSubscriptions = 0;
          var source = AeroTizen.settings, subscribe = source.subscribe;
          source.subscribe = function (listener) {
            window.preferenceSourceSubscriptions++;
            var unsubscribe = subscribe.call(source, listener);
            return function () { window.preferenceSourceSubscriptions--; unsubscribe(); };
          };
        ` + (await response.text()),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["demo0", "demo1"], background: "black", showWeather: false }),
      );
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
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

test("Continue Watching demo is opt-in, local to Vite and uses separate preferences", async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.goto("http://127.0.0.1:8172/");
  await page.waitForFunction(
    () => AeroTizen.apps.getSnapshot().ready && Array.isArray(AeroTizen.settings.getSnapshot().home),
  );
  await expect(page.locator("#continue-section")).toBeHidden();
  const original = await page.evaluate(() => localStorage.getItem("aerotizen.settings.v1"));
  await page.goto("http://127.0.0.1:8172/?demo=1");
  await expect(page.locator("#continue-section")).toBeVisible();
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(5);
  await expect(
    page.locator(
      "[data-continue-part=source-badge] :is([data-app-artwork], [data-app-fallback] > svg, [data-app-fallback] > img):visible",
    ),
  ).toHaveCount(5);
  await expect(page.locator("[data-continue-part=progress-fill]")).toHaveCount(4);
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
  const heights = await page
    .locator("#continue-items > [data-key]")
    .evaluateAll((cards) => cards.map((card) => card.offsetHeight));
  expect(heights).toEqual(Array(5).fill(318));
  await expect(page.locator("[data-continue-part=image]").first()).toHaveJSProperty("complete", true);
  expect(
    await page
      .locator("[data-continue-part=image]")
      .first()
      .evaluate((image) => image.naturalWidth),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("aerotizen.settings.v1"))).toBe(original);
  await page.goto("http://127.0.0.1:8171/?demo=1");
  await expect(page.locator("#continue-section")).toBeHidden();
});
