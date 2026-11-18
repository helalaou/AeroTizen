const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");
const openSettings = async (page, theme) => {
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((theme) => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem("aerotizen.settings.v1", JSON.stringify({ theme, showWeather: true, weatherPhoto: false }));
    }
  }, theme);
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready && AeroTizen.inputs.getSnapshot().sources.length);
  await page.locator("#gear").click();
};
const nativeKey = (page, key, phase, extra = {}) =>
  page.evaluate(
    ({ key, phase, extra }) => {
      document.activeElement.dispatchEvent(
        new KeyboardEvent(phase, {
          keyCode: AeroTizen.config.KEY[key],
          bubbles: true,
          cancelable: true,
          ...extra,
        }),
      );
    },
    { key, phase, extra },
  );
const theme = "glass";
test(`${theme} held Back leaves the text field, then search, then the Settings pane in separate presses`, async ({
  page,
}) => {
  await openSettings(page, theme);
  await openCategory(page, "weather");
  await page.locator('[data-key="weather:change"]').click();
  const input = page.getByRole("textbox", { name: "Weather location", exact: true });
  await expect(input).toBeFocused();
  await input.fill("A city");
  await page.keyboard.down("Escape");
  await page.keyboard.down("Escape");
  await page.keyboard.up("Escape");
  await expect(input).not.toBeFocused();
  await expect(page.locator('[data-key="weather:query"]')).toBeFocused();
  await expect(page.locator("#weather-location-editor")).toBeVisible();
  await page.keyboard.down("Escape");
  await page.keyboard.down("Escape");
  await page.keyboard.up("Escape");
  await expect(page.locator("#weather-location-editor")).toBeHidden();
  await expect(page.locator('[data-key="weather:change"]')).toBeFocused();
  await expect(page.locator('[data-settings-drawer="frame"]')).toHaveAttribute("data-expanded", "true");
  await page.locator('[data-key="weather:change"]').click();
  await expect(input).toHaveValue("A city");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-settings-drawer="frame"]')).toHaveAttribute("data-expanded", "false");
  await expect(page.locator("#editor")).toBeVisible();
});
test(`${theme} input-name drafts survive external updates, finish with Done and save on Settings close`, async ({
  page,
}) => {
  await openSettings(page, theme);
  await openCategory(page, "sources");
  const input = page.getByRole("textbox", { name: "HDMI 1 name", exact: true });
  await input.fill("Living room");
  await page.evaluate(() => AeroTizen.settings.update({ inputNames: { "HDMI 1": "External" } }));
  await expect(input).toHaveValue("Living room");
  await nativeKey(page, "IME_DONE", "keydown");
  await nativeKey(page, "IME_DONE", "keyup");
  await expect(page.locator('[data-key="name:HDMI 1"]')).toBeFocused();
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().inputNames["HDMI 1"])).toBe("Living room");
  await input.fill("Saved on close");
  await page.evaluate(() => AeroTizen.settingsUi.close());
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().inputNames["HDMI 1"])).toBe("Saved on close");
  await page.reload();
  await page.locator("#gear").click();
  await openCategory(page, "sources");
  await expect(input).toHaveValue("Saved on close");
});
test(`${theme} composition keeps native keys and Done submits once`, async ({ page }) => {
  await openSettings(page, theme);
  let searches = 0;
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => {
    searches++;
    return route.fulfill({ json: { results: [] } });
  });
  await openCategory(page, "weather");
  await page.locator('[data-key="weather:change"]').click();
  const input = page.getByRole("textbox", { name: "Weather location", exact: true });
  await input.fill("A");
  await page.keyboard.down("Space");
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await expect(input).toHaveValue("A  ");
  await input.fill("Test city");
  for (const key of ["ENTER", "IME_CANCEL"]) {
    await nativeKey(page, key, "keydown", { isComposing: true });
    await nativeKey(page, key, "keydown", { isComposing: true, repeat: true });
    await nativeKey(page, key, "keyup");
  }
  await expect(input).toBeFocused();
  expect(searches).toBe(0);
  await nativeKey(page, "IME_DONE", "keydown", { isComposing: true });
  await nativeKey(page, "IME_DONE", "keyup");
  await expect.poll(() => searches).toBe(1);
  await expect(page.locator('[data-key="weather:search"]')).toBeFocused();
});
