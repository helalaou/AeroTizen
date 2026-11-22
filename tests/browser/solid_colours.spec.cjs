const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");
const openSolid = async (page, theme) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((theme) => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          background: "custom",
          customColour: "#7c5cff",
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
  await expect(page.locator('[data-key="wallpaper-categories:solid"]')).toHaveAttribute("aria-pressed", "true");
  return errors;
};
const rootColour = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")));
const theme = "glass";
test(`${theme}: remote-only picker previews, cancels, applies and restores focus`, async ({ page }) => {
  const errors = await openSolid(page, theme);
  // Pass both category rows, enter the aligned tile, then move across to Custom.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="wallpaper-categories:animated"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const tiles = page.locator("#bg-still [data-wallpaper-swatch]:visible");
  await expect(tiles.nth(4)).toBeFocused();
  for (let column = 4; column > 0; column--) await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-key="bg:custom"]')).toBeFocused();
  await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog", { name: "Custom colour" });
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAccessibleDescription(/Up\/Down.*Left\/Right/);
  const pickerSurface = await picker.evaluate((node) => {
    const paint = (element, properties) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    };
    const surface = ["background", "border", "border-radius", "box-shadow", "color", "font-family"];
    const typography = ["font-family", "font-size", "font-weight", "line-height", "color"];
    return {
      picker: paint(node, surface),
      drawer: paint(document.querySelector('[data-settings-drawer="frame"]'), surface),
      pickerTitle: paint(node.querySelector("[data-settings-heading-title]"), typography),
      drawerTitle: paint(document.querySelector("[data-settings-title]"), typography),
      pickerDescription: paint(node.querySelector("[data-settings-heading-description]"), typography),
      sectionDescription: paint(
        document.querySelector('[data-settings-heading="section"] [data-settings-heading-description]'),
        typography,
      ),
    };
  });
  expect(pickerSurface.picker).toEqual(pickerSurface.drawer);
  expect(pickerSurface.pickerTitle).toEqual(pickerSurface.drawerTitle);
  expect(pickerSurface.pickerDescription).toEqual(pickerSurface.sectionDescription);
  await expect(page.locator('[data-key="colour:hue"]')).toBeFocused();
  await expect(page.locator('[data-settings-drawer="overlay"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const before = await saved(page);
  const beforeColour = await rootColour(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("slider", { name: "Colour strength", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => rootColour(page)).not.toBe(beforeColour);
  expect(await saved(page)).toEqual(before);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="colour:apply"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-key="colour:cancel"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect.poll(() => rootColour(page)).toBe(beforeColour);
  await expect(page.locator('[data-key="bg:custom"]')).toBeFocused();
  expect(await saved(page)).toEqual(before);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-key="colour:apply"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.locator('[data-key="bg:custom"]')).toBeFocused();
  const applied = await saved(page);
  expect(applied.background).toBe("custom");
  expect(applied.customColour).not.toBe(before.customColour);
  const appliedColour = await rootColour(page);
  await page.keyboard.press("Enter");
  await expect(picker).toBeVisible();
  await expect.poll(() => rootColour(page)).toBe(appliedColour);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect.poll(() => rootColour(page)).toBe(appliedColour);
  expect((await saved(page)).customColour).toBe(applied.customColour);
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await expect(page.locator('[data-key="bg:custom"]')).toHaveCSS("background-color", appliedColour);
  await page.locator('[data-key="bg:custom"]').click();
  await expect.poll(() => rootColour(page)).toBe(appliedColour);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
