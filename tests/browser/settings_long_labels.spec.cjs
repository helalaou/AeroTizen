const { test, expect } = require("./launcher_fixture.cjs");
const path = require("node:path");

const { openCategory } = require("./drawer_helpers.cjs");
const { loadTypeScript } = require("../helpers/load_typescript.cjs");
const { catalogues } = loadTypeScript(path.join(__dirname, "../../launcher/src/shared/i18n/catalogues.ts"));

const openSettings = async (page, language) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript((language) => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({ language, background: "black", showWeather: false }),
    );
  }, language);
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.locator("#gear").click();
};

for (const language of Object.keys(catalogues)) {
  test(`${language} Settings menu keeps each description inside its row`, async ({ page }) => {
    await openSettings(page, language);
    const descriptions = page.locator('[data-settings-drawer="menu"] [data-key^="section:"] small');
    await expect(descriptions.first()).toBeVisible();
    const overflowing = await descriptions.evaluateAll((nodes) =>
      nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.textContent),
    );
    expect(overflowing).toEqual([]);
    const menu = page.locator('[data-settings-drawer="menu"]');
    expect(await menu.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
  });

  test(`${language} Custom background label stays inside its swatch`, async ({ page }) => {
    await openSettings(page, language);
    await openCategory(page, "wallpaper");
    const label = page.locator('[data-key="bg:custom"] [data-wallpaper-label]');
    await expect(label).toBeVisible();
    const text = await label.evaluate((node) => ({
      fits: node.scrollWidth <= node.clientWidth,
      overflow: getComputedStyle(node).textOverflow,
    }));
    expect(text.fits || text.overflow === "ellipsis").toBe(true);
  });
}
