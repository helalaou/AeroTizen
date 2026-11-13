const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");

const openSlider = async (page, theme) => {
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((theme) => {
    if (!localStorage.getItem("aerotizen.settings.v1"))
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
  test(`${theme} pointer steps apply and save speed without an edit mode or Preview button`, async ({ page }, info) => {
    const slider = await openSlider(page, theme);
    const increase = slider.getByRole("button", { name: "Increase Background speed" });
    await increase.click();
    await increase.click();
    await slider.getByRole("button", { name: "Decrease Background speed" }).click();
    await expect(slider).toHaveAttribute("aria-valuenow", "1.25");
    await expect(slider).toHaveAttribute("aria-valuetext", "1.25×");
    await expect(slider).toBeFocused();
    await expect(page.getByText("OK to adjust", { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-key="preview"]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("live-speed-slider.png") });
    await page.reload();
    await page.locator("#gear").click();
    await openCategory(page, "wallpaper");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.25");
  });

  test(`${theme} focused speed applies to animation immediately and Back returns to the sidebar`, async ({ page }) => {
    const slider = await openSlider(page, theme);
    const drawer = page.locator("[data-settings-drawer=frame]");
    for (let repeat = 0; repeat < 3; repeat++) await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.75");
    await expect(slider).toBeFocused();
    const durations = await page
      .locator("#bg [data-background-wave]")
      .evaluateAll((nodes) => nodes.map((node) => parseFloat(node.style.animationDuration)));
    expect(durations[0]).toBeCloseTo(28 / 1.75, 4);
    expect(durations[1]).toBeCloseTo(18 / 1.75, 4);
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.75");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.5");
    await page.keyboard.down("Escape");
    await page.keyboard.down("Escape");
    await page.keyboard.up("Escape");
    await expect(drawer).toHaveAttribute("data-expanded", "false");
    await expect(page.locator("#editor")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
  });

  test(`${theme} speed navigation and reopening cannot transfer a held arrow`, async ({ page }) => {
    const slider = await openSlider(page, theme);
    await page.keyboard.press("ArrowUp");
    await expect(slider).not.toBeFocused();
    await slider.focus();
    await page.keyboard.down("ArrowRight");
    await page.evaluate(() => AeroTizen.settingsUi.close());
    await page.evaluate(() => AeroTizen.settingsUi.open());
    await openCategory(page, "wallpaper");
    await slider.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.25");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.5");
    await page.keyboard.down("ArrowRight");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.75");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "2");
  });

  test(`${theme} held speed input cannot transfer after focus changes or a hidden filter`, async ({ page }) => {
    const slider = await openSlider(page, theme);
    await page.keyboard.down("ArrowRight");
    const waves = page.locator('[data-key="bg:waves"]');
    await waves.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.25");
    await expect(waves).toBeFocused();
    await page.locator('[data-key="wallpaper-categories:solid"]').click();
    await page.locator('[data-key="wallpaper-categories:animated"]').click();
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1.5");
  });
}
