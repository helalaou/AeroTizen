const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");

const image = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundImage);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")));

const openGradient = async (page, glass) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((glassSettings) => {
    const key = "aerotizen.settings.v1";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({
          background: "custom-gradient",
          customColour: "#012345",
          customGradient: { start: "#336699", end: "#ff0000", angle: 90 },
          glassSettings,
          showWeather: false,
          home: ["demo0", "demo1"],
        }),
      );
    }
  }, glass);
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  await expect(page.locator("#grid > [data-id]")).toHaveCount(2);
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await expect(page.locator('[data-key="wallpaper-categories:gradient"]')).toHaveAttribute("aria-pressed", "true");
  return errors;
};

const editBothColours = async (page) => {
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="colour:hue"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-key="gradient:stop:1"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="colour:hue"]')).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("ArrowRight");
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="gradient:angle"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
};

for (const glass of [false, true]) {
  const theme = glass ? "Glass" : "Classic";
  test(`${theme}: gradient tiles and remote editor preview, cancel, save and reopen both colours and direction`, async ({
    page,
  }) => {
    const errors = await openGradient(page, glass);
    const tiles = page.locator("#bg-still [data-wallpaper-swatch]:visible");
    await expect(tiles).toHaveCount(15);
    await expect(tiles.first()).toHaveAttribute("data-key", "bg:custom-gradient");
    await expect(tiles.first().locator("[data-wallpaper-edit]")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`grid-${theme}.png`) });
    const before = await saved(page);
    const original = await image(page);
    await page.keyboard.press("ArrowDown");
    await expect(tiles.first()).toBeFocused();
    await page.keyboard.press("Enter");
    const editor = page.getByRole("dialog", { name: "Custom gradient" });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAccessibleDescription(/OK selects a colour.*Hold to adjust faster/);
    await expect(page.locator('[data-key="gradient:stop:0"]')).toBeFocused();
    await editBothColours(page);
    await expect.poll(() => image(page)).not.toBe(original);
    expect(await saved(page)).toEqual(before);
    const box = await editor.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(1080);
    await page.screenshot({ path: test.info().outputPath(`editor-${theme}.png`) });
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-key="colour:apply"]')).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(editor).toBeHidden();
    await expect(tiles.first()).toBeFocused();
    await expect.poll(() => image(page)).toBe(original);
    expect(await saved(page)).toEqual(before);
    await page.keyboard.press("Enter");
    await editBothColours(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const applied = await saved(page);
    expect(applied.background).toBe("custom-gradient");
    expect(applied.customGradient.start).not.toBe(before.customGradient.start);
    expect(applied.customGradient.end).not.toBe(before.customGradient.end);
    expect(applied.customGradient.angle).toBe(91);
    expect(applied.customColour).toBe("#012345");
    const current = await image(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => image(page)).toBe(current);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-key="colour:hue"]')).toHaveAttribute("aria-valuenow", "211");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect.poll(() => image(page)).toBe(current);
    await page.locator("#gear").click();
    await openCategory(page, "wallpaper");
    await expect(tiles.first()).toHaveCSS("background-image", current);
    await tiles.first().click();
    await expect.poll(() => image(page)).toBe(current);
    await expect(page.locator('[data-key="gradient:angle"]')).toHaveAttribute("aria-valuenow", "91");
    expect(errors).toEqual([]);
  });
}

test("held arrows accelerate in stages and releasing restores one-degree precision", async ({ page }) => {
  const base = Date.UTC(2026, 10, 6, 12);
  await page.clock.setFixedTime(new Date(base));
  const errors = await openGradient(page, true);
  await page.locator('[data-key="bg:custom-gradient"]').click();
  await page.keyboard.press("ArrowDown");
  const hue = page.locator('[data-key="colour:hue"]');
  await page.keyboard.down("ArrowRight");
  await expect(hue).toHaveAttribute("aria-valuenow", "211");
  for (const [time, value] of [
    [500, 212],
    [650, 217],
    [1000, 222],
    [1500, 232],
  ]) {
    await page.clock.setFixedTime(new Date(base + time));
    await page.keyboard.down("ArrowRight");
    await expect(hue).toHaveAttribute("aria-valuenow", String(value));
  }
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(hue).toHaveAttribute("aria-valuenow", "233");
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
  const angle = page.locator('[data-key="gradient:angle"]');
  await expect(angle).toBeFocused();
  await page.keyboard.down("ArrowRight");
  await expect(angle).toHaveAttribute("aria-valuenow", "91");
  await page.clock.setFixedTime(new Date(base + 2150));
  await page.keyboard.down("ArrowRight");
  await expect(angle).toHaveAttribute("aria-valuenow", "96");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(angle).toHaveAttribute("aria-valuenow", "95");
  expect(errors).toEqual([]);
});

test("Back restores a weather photo after a gradient preview, and light gradients keep dark status text", async ({
  page,
}) => {
  const errors = await openGradient(page, true);
  await page.evaluate(() => {
    AeroTizen.weather.currentReading = () => ({ code: 0 });
    AeroTizen.weather.solarPhase = () => "day";
    AeroTizen.settings.update({ weatherPhoto: true });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("[data-weather-photo]")).toBeVisible();
  const before = await saved(page);
  await page.locator('[data-key="bg:custom-gradient"]').click();
  await expect(page.locator("[data-weather-photo]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-weather-photo]")).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.evaluate(() => {
    AeroTizen.settings.update({
      weatherPhoto: false,
      customGradient: { start: "#ffffff", end: "#ffffdd", angle: 180 },
    });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("html")).toHaveAttribute("data-light-background", "true");
  await expect(page.locator("#gear")).toHaveCSS("color", "rgb(21, 21, 27)");
  expect(errors).toEqual([]);
});
