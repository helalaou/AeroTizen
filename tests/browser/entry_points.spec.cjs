const { test, expect } = require("./launcher_fixture.cjs");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
  ["TV development", "http://127.0.0.1:8173/"],
]) {
  test(`${name} starts Home and opens and closes Settings`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["demo0", "demo1"], background: "black", showWeather: false }),
      );
    });
    await page.goto(url);
    await expect(page).toHaveTitle(/AeroTizen/);
    const cards = page.locator("#grid > [data-id]");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.nth(1)).toBeInViewport();
    await page.locator("#gear").click();
    await expect(page.locator("#editor")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    await expect(cards.nth(1)).toBeFocused();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
