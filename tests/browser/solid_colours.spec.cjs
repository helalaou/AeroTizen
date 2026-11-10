const { test, expect } = require("@playwright/test");
const { openCategory } = require("./drawer_helpers.cjs");

const openSolid = async (page, glass) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript((glassSettings) => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          background: "custom",
          customColour: "#7c5cff",
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
  await expect(page.locator('[data-key="wallpaper-categories:solid"]')).toHaveAttribute("aria-pressed", "true");
  return errors;
};

const rootColour = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")));
const tabPaint = (page) =>
  page.locator("[data-header-tabs]").evaluate((tabs) => {
    const panel = getComputedStyle(tabs);
    const selection = getComputedStyle(tabs.querySelector("[data-header-focus=tabs]"));
    return {
      background: panel.background,
      border: panel.borderColor,
      text: Array.from(tabs.querySelectorAll('[role="button"]'), (button) => getComputedStyle(button).color),
      selection: selection.background,
      selectionShadow: selection.boxShadow,
    };
  });

for (const glass of [false, true]) {
  const theme = glass ? "Glass" : "Classic";
  test(`${theme}: twenty colour tiles include bright presets and preserve a solid category after reload`, async ({
    page,
  }) => {
    const errors = await openSolid(page, glass);
    await expect(page.locator("#bg-still [data-wallpaper-swatch]:visible")).toHaveCount(20);
    await expect(page.locator('[data-key="bg:navy"]')).toBeHidden();
    const tiles = page.locator("#bg-still [data-wallpaper-swatch]:visible");
    await expect(tiles.first()).toHaveAttribute("data-key", "bg:custom");
    await expect(tiles.first()).toHaveText("Custom");
    await expect(tiles.first().locator("[data-wallpaper-edit] .lucide-pencil")).toBeVisible();
    await expect(tiles.locator("[data-wallpaper-edit]")).toHaveCount(1);
    const editBox = await tiles.first().locator("[data-wallpaper-edit]").boundingBox();
    const labelBox = await tiles.first().locator("[data-wallpaper-label]").boundingBox();
    expect(editBox.x + editBox.width).toBeLessThan(labelBox.x);
    expect(Math.abs(editBox.y - labelBox.y)).toBeLessThan(2);
    const sizes = await tiles.evaluateAll((tiles) => tiles.map((tile) => [tile.offsetWidth, tile.offsetHeight]));
    expect(sizes.every(([width, height]) => width === sizes[0][0] && height === sizes[0][1])).toBe(true);
    const custom = page.locator('[data-key="bg:custom"]');
    const customBox = await custom.boundingBox();
    const scrollBox = await page.locator('[data-settings-drawer="scroll"]').boundingBox();
    expect(customBox.y + customBox.height).toBeLessThanOrEqual(scrollBox.y + scrollBox.height);
    await page.screenshot({ path: test.info().outputPath(`presets-${theme}.png`) });
    await page.locator('[data-key="bg:black"]').click();
    const darkTabs = await tabPaint(page);
    expect(darkTabs.text).toHaveLength(2);
    await page.locator('[data-key="bg:solid-white"]').click();
    await expect.poll(() => rootColour(page)).toBe("rgb(255, 255, 255)");
    await expect(page.locator("html")).toHaveAttribute("data-light-background", "true");
    expect(await tabPaint(page)).toEqual(darkTabs);
    await expect
      .poll(() => page.locator("#gear").evaluate((node) => getComputedStyle(node).color))
      .toBe("rgb(21, 21, 27)");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: test.info().outputPath(`white-home-${theme}.png`) });
    await page.reload();
    await expect.poll(() => rootColour(page)).toBe("rgb(255, 255, 255)");
    await page.locator("#gear").click();
    await openCategory(page, "wallpaper");
    await expect(page.locator('[data-key="wallpaper-categories:solid"]')).toHaveAttribute("aria-pressed", "true");
    expect((await saved(page)).customColour).toBe("#7c5cff");
    expect(errors).toEqual([]);
  });

  test(`${theme}: floating text follows light colours across every clock layout`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.weather.v2",
        JSON.stringify({ temp: 12, code: 71, city: "Test city", source: "auto", unit: "C", at: Date.now() }),
      );
    });
    const errors = await openSolid(page, glass);
    await page.evaluate(() => AeroTizen.settings.update({ showWeather: true }));
    await page.locator('[data-key="bg:solid-white"]').click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    for (const layout of ["classic", "vertical", "horizontal", "minimal", "bold"]) {
      await page.evaluate((layout) => {
        AeroTizen.settings.update({
          clockLayout: layout === "classic" ? "classic" : "custom",
          aeroClockStyle: layout === "classic" ? "vertical" : layout,
        });
      }, layout);
      const time = page.locator(layout === "classic" ? "#time" : '[data-clock-part="time"]');
      await expect(time).toBeVisible();
      await expect(time).toHaveCSS("color", "rgb(21, 21, 27)");
      const icon = page.locator(layout === "classic" ? "#weather svg" : '[data-weather-part="icon"] svg');
      await expect(icon).toBeVisible();
      await expect(icon).toHaveCSS("stroke", "rgb(21, 21, 27)");
    }
    await page.locator("#gear").click();
    await openCategory(page, "wallpaper");
    await page.locator('[data-key="bg:black"]').click();
    await expect(page.locator("html")).toHaveAttribute("data-light-background", "false");
    await expect(page.locator('[data-clock-part="time"]')).toHaveCSS("color", "rgb(255, 255, 255)");
    const icon = page.locator('[data-weather-part="icon"] svg');
    await expect(icon).toHaveCSS("stroke", "rgb(255, 255, 255)");
    await page.evaluate(() => {
      AeroTizen.settings.update({ customColour: "#fcfaf5" });
    });
    await page.locator('[data-key="bg:custom"]').click();
    await expect(icon).toHaveCSS("stroke", "rgb(21, 21, 27)");
    await page.keyboard.press("Escape");
    await expect(icon).toHaveCSS("stroke", "rgb(255, 255, 255)");
    await page.keyboard.press("Enter");
    await page.locator('[data-key="colour:apply"]').click();
    await expect(icon).toHaveCSS("stroke", "rgb(21, 21, 27)");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: test.info().outputPath(`light-weather-${theme}.png`) });
    expect(errors).toEqual([]);
  });

  test(`${theme}: remote-only picker previews, cancels, applies and restores focus`, async ({ page }) => {
    const errors = await openSolid(page, glass);
    // Custom is the first tile below the category row.
    await page.keyboard.press("ArrowDown");
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
    await page.screenshot({ path: test.info().outputPath(`picker-${theme}.png`) });
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
}

test("demo preview reopens the current custom colour before and after a reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript(() => {
    const key = "aerotizen.settings.v1.demo";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({ background: "custom", customColour: "#336699", glassSettings: true, showWeather: false }),
      );
    }
  });
  await page.goto("http://127.0.0.1:8172/?demo=1");
  await expect.poll(() => rootColour(page)).toBe("rgb(51, 102, 153)");
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  const custom = page.locator('[data-key="bg:custom"]');
  await expect(custom).toHaveCSS("background-color", "rgb(51, 102, 153)");
  await custom.click();
  await expect(page.locator('[data-key="colour:hue"]')).toHaveAttribute("aria-valuenow", "210");
  await expect(page.locator('[data-key="colour:strength"]')).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator('[data-key="colour:lightness"]')).toHaveAttribute("aria-valuenow", "40");
  await expect.poll(() => rootColour(page)).toBe("rgb(51, 102, 153)");
  await page.keyboard.press("ArrowRight");
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const applied = await rootColour(page);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-key="colour:hue"]')).toHaveAttribute("aria-valuenow", "211");
  await expect.poll(() => rootColour(page)).toBe(applied);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect.poll(() => rootColour(page)).toBe(applied);
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await custom.click();
  await expect(page.locator('[data-key="colour:hue"]')).toHaveAttribute("aria-valuenow", "211");
  await expect.poll(() => rootColour(page)).toBe(applied);
  expect(errors).toEqual([]);
});

test("Back and external close cancel a preview, including the weather-photo background", async ({ page }) => {
  const errors = await openSolid(page, false);
  await page.evaluate(() => {
    AeroTizen.weather.currentReading = () => ({ code: 0 });
    AeroTizen.weather.solarPhase = () => "day";
    AeroTizen.settings.update({ weatherPhoto: true });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("#weather-photo")).toBeVisible();
  const before = await saved(page);
  await page.locator('[data-key="bg:custom"]').click();
  await expect(page.locator("#weather-photo")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.locator("#weather-photo")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-light-background", "false");
  expect(await saved(page)).toEqual(before);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.evaluate(() => AeroTizen.settingsUi.close());
  await expect(page.locator("#editor")).toBeHidden();
  await expect(page.locator("#weather-photo")).toBeVisible();
  expect(await saved(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("Arabic picker keeps physical Left/Right adjustment and returns focus to Custom", async ({ page }) => {
  const errors = await openSolid(page, true);
  await page.evaluate(() => {
    AeroTizen.settings.update({ language: "ar" });
  });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.locator('[data-key="bg:custom"]').click();
  const hue = page.locator('[data-key="colour:hue"]');
  const value = Number(await hue.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowLeft");
  await expect(hue).toHaveAttribute("aria-valuenow", String((value + 359) % 360));
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-key="bg:custom"]')).toBeFocused();
  expect(errors).toEqual([]);
});
