const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");

const openSlider = async (page, theme) => {
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((theme) => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({ background: "waves", speed: 1, theme, showWeather: false, weatherPhoto: false }),
    );
  }, theme);
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready && AeroTizen.homeScreen);
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  const slider = page.getByRole("slider", { name: "Background speed" });
  await slider.focus();
  return slider;
};

for (const theme of ["classic", "glass"]) {
  test(`${theme} speed editing owns held arrows and exit keys without closing the drawer`, async ({ page }) => {
    const slider = await openSlider(page, theme);
    const drawer = page.locator("[data-settings-drawer=frame]");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-key="preview"]')).toBeFocused();
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toBeFocused();
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await expect(slider).toHaveAttribute("data-adjusting", "true");
    for (let repeat = 0; repeat < 3; repeat++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.75");
    await expect(slider).toBeFocused();
    await page.keyboard.down("Escape");
    await page.keyboard.down("Escape");
    await page.keyboard.up("Escape");
    await expect(slider).not.toHaveAttribute("data-adjusting", "true");
    await expect(drawer).toHaveAttribute("data-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("data-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
  });

  test(`${theme} speed editing ends on vertical navigation, pointer focus, blur and reopen`, async ({ page }) => {
    const slider = await openSlider(page, theme);
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await expect(slider).not.toHaveAttribute("data-adjusting", "true");
    await expect(slider).not.toBeFocused();
    await slider.click();
    await page.locator('[data-key="preview"]').focus();
    await expect(slider).not.toHaveAttribute("data-adjusting", "true");
    await slider.click();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(slider).not.toHaveAttribute("data-adjusting", "true");
    await slider.click();
    await page.evaluate(() => AeroTizen.settingsUi.close());
    await page.evaluate(() => AeroTizen.settingsUi.open());
    await openCategory(page, "wallpaper");
    await slider.focus();
    await expect(slider).not.toHaveAttribute("data-adjusting", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-key="preview"]')).toBeFocused();
    await expect(slider).toHaveAttribute("aria-valuenow", "1");
  });

  test(`${theme} held speed input cannot transfer after focus changes or a hidden filter`, async ({ page }) => {
    const slider = await openSlider(page, theme);
    await slider.click();
    await page.keyboard.down("ArrowRight");
    await page.locator('[data-key="preview"]').focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.25");
    await expect(page.locator('[data-key="preview"]')).toBeFocused();
    await slider.click();
    await page.locator('[data-key="wallpaper-categories:solid"]').click();
    await page.locator('[data-key="wallpaper-categories:animated"]').click();
    await slider.focus();
    await expect(slider).not.toHaveAttribute("data-adjusting", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-key="preview"]')).toBeFocused();
  });
}
