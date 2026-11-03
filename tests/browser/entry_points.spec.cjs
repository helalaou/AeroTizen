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
    await page.route("**/js/settings.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        response,
        body:
          body +
          `
          window.preferenceSourceSubscriptions = 0;
          var source = AeroTizen.settings, subscribe = source.subscribe;
          source.subscribe = function (listener) {
            window.preferenceSourceSubscriptions++;
            var unsubscribe = subscribe.call(source, listener);
            return function () { window.preferenceSourceSubscriptions--; unsubscribe(); };
          };
        `,
      });
    });
    await page.route("**/js/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          "window.uiPreferenceSourceSubscriptions = window.preferenceSourceSubscriptions;\n" + (await response.text()),
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
    await expect(page.locator("#home-root #grid > .tile")).toHaveCount(2);
    await expect(page.locator("#home-root #grid > .tile").first()).toHaveClass(/focused/);
    await page.locator("#gear").click();
    await expect(page.locator("#settings-root #editor")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    expect(await page.evaluate(() => window.uiPreferenceSourceSubscriptions)).toBe(1);
    // The existing Continue Watching service also watches its persisted opt-in settings.
    expect(await page.evaluate(() => window.preferenceSourceSubscriptions)).toBe(2);
    expect(await page.evaluate(() => typeof AeroTizen.inputs.render)).toBe("undefined");
    expect(
      await page.evaluate(() =>
        Array.from(document.scripts, (script) => script.src && new URL(script.src).pathname).filter((file) =>
          /\/(?:settings-ui|home-screen|continue-row|clock-layouts)\.js$/.test(file),
        ),
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
