const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");
const image = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundImage);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")));
const openGradient = async (page, theme) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((theme) => {
    const key = "aerotizen.settings.v1";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({
          background: "custom-gradient",
          customColour: "#012345",
          customGradient: { start: "#336699", end: "#ff0000", angle: 90 },
          theme,
          showWeather: false,
          home: ["demo0", "demo1"],
        }),
      );
    }
  }, theme);
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
const theme = "glass";
test(`${theme}: gradient tiles and remote editor preview, cancel, save and reopen both colours and direction`, async ({
  page,
}) => {
  const errors = await openGradient(page, theme);
  const tiles = page.locator("#bg-still [data-wallpaper-swatch]:visible");
  await expect(tiles).toHaveCount(20);
  await expect(tiles.first()).toHaveAttribute("data-key", "bg:custom-gradient");
  await expect(tiles.first().locator("[data-wallpaper-edit]")).toBeVisible();
  const before = await saved(page);
  const original = await image(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="wallpaper-categories:animated"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(tiles.nth(4)).toBeFocused();
  // Enter the aligned rightmost tile, then move across to Custom.
  for (let column = 4; column > 0; column--) await page.keyboard.press("ArrowLeft");
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
