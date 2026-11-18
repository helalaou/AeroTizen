const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");

const themes = ["classic", "glass", "pop", "frost", "gloss", "amethyst", "mint", "halo"];
const selectedFocusThemes = new Set(["classic", "pop", "frost", "halo", "mint"]);
const categories = ["appearance", "weather", "wallpaper", "status", "sources", "language", "about"];

const expectFullWidthGrid = async (grid) => {
  const layout = await grid.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const tiles = [...node.children].filter((child) => !child.hidden).map((child) => child.getBoundingClientRect());
    const row = tiles.filter((tile) => Math.abs(tile.top - tiles[0].top) < 1);
    return {
      leftGap: Math.min(...row.map((tile) => tile.left)) - bounds.left,
      rightGap: bounds.right - Math.max(...row.map((tile) => tile.right)),
      overflow: node.scrollWidth - node.clientWidth,
    };
  });
  expect(Math.abs(layout.leftGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.rightGap)).toBeLessThanOrEqual(1);
  expect(layout.overflow).toBe(0);
};

for (const theme of themes) {
  for (const language of ["en", "pt-BR", "ar"]) {
    test(`${theme} ${language} aligned fields keep labels clear and apply controls in the same pane`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) errors.push(message.text());
      });
      await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        ({ theme, language }) => {
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({ theme, language, background: "black", showWeather: true, weatherShowLocation: false }),
          );
        },
        { theme, language },
      );
      await page.goto("/");
      await expect(page).toHaveTitle("AeroTizen");
      await page.locator("#gear").click();
      for (const category of categories) {
        await openCategory(page, category);
        const fields = page.locator(`[data-section-pane="${category}"] [data-settings-field]:visible`);
        expect(await fields.count()).toBeGreaterThan(0);
        for (const field of await fields.all()) {
          const layout = await field.evaluate((node) => {
            const heading = node.firstElementChild;
            const controls = node.querySelector("[data-settings-field-controls]");
            const a = heading.getBoundingClientRect();
            const b = controls.getBoundingClientRect();
            const bounds = node.getBoundingClientRect();
            const labels = [...controls.querySelectorAll('[role="button"] > span')];
            const choicesFit = labels.every((label) => {
              const visible = label.getBoundingClientRect();
              const copy = label.cloneNode(true);
              // Compare layout height without clamping. Font ink can exceed a line
              // box even when every character fits, as with Jost in Frost.
              Object.assign(copy.style, {
                position: "absolute",
                visibility: "hidden",
                display: "block",
                webkitLineClamp: "unset",
                width: visible.width + "px",
                height: "auto",
                maxHeight: "none",
              });
              label.parentElement.append(copy);
              const height = copy.getBoundingClientRect().height;
              copy.remove();
              return height <= visible.height + 1;
            });
            const switches = [...controls.querySelectorAll('[role="switch"] [aria-hidden="true"]')];
            const rtl = document.documentElement.dir === "rtl";
            const group = controls.querySelector("[data-settings-control-group]");
            const buttons = group ? [...group.children].map((button) => button.getBoundingClientRect()) : [];
            const rowTops = [...new Set(buttons.map((button) => Math.round(button.top)))];
            const rows = rowTops.length;
            return {
              gap: rtl ? a.left - b.right : b.left - a.right,
              contained: b.left >= bounds.left && b.right <= bounds.right,
              labelFits: heading.scrollWidth <= heading.clientWidth,
              choicesFit,
              alignmentGap: rows > 1 ? Math.abs(a.top - b.top) : Math.abs((a.top + a.bottom - b.top - b.bottom) / 2),
              buttonWidthsFit: buttons.every((button) => Math.abs(button.width - (b.width - 24) / 3) <= 1),
              rowsAlignToEnd: rowTops.every((top) => {
                const row = buttons.filter((button) => Math.round(button.top) === top);
                const gap = rtl
                  ? Math.min(...row.map((button) => button.left)) - b.left
                  : b.right - Math.max(...row.map((button) => button.right));
                return Math.abs(gap) <= 1;
              }),
              switchesFit: switches.every((state) => state.scrollWidth <= state.clientWidth),
              controlsFit: [...controls.querySelectorAll("[data-key]")].every((control) => {
                const rect = control.getBoundingClientRect();
                return rect.left >= b.left - 1 && rect.right <= b.right + 1;
              }),
            };
          });
          expect(layout.gap).toBeGreaterThan(20);
          expect(layout.contained).toBe(true);
          expect(layout.labelFits).toBe(true);
          expect(layout.choicesFit).toBe(true);
          expect(layout.switchesFit).toBe(true);
          expect(layout.controlsFit).toBe(true);
          expect(layout.alignmentGap).toBeLessThanOrEqual(1);
          expect(layout.buttonWidthsFit).toBe(true);
          expect(layout.rowsAlignToEnd).toBe(true);
        }
      }
      await openCategory(page, "apps");
      await expectFullWidthGrid(page.locator("#all-apps"));
      const fireplaceKey = await page.evaluate(() => "app:" + AeroTizen.config.FIREPLACE_ID);
      const fireplace = page.locator(`[data-key="${fireplaceKey}"]`);
      const fireplaceBackground = await fireplace.evaluate((node) => getComputedStyle(node).backgroundImage);
      expect(fireplaceBackground).toContain("radial-gradient");
      await fireplace.focus();
      await expect(fireplace).toHaveAttribute("data-focused", "true");
      await expect(fireplace).toHaveCSS("background-image", fireplaceBackground);
      await page.keyboard.press("Enter");
      await expect(fireplace).toHaveCSS("background-image", fireplaceBackground);
      await openCategory(page, "wallpaper");
      await expectFullWidthGrid(page.locator("#bg-still"));
      const wallpaperLayout = () =>
        page.locator('[data-settings-drawer="scroll"]').evaluate((node) => ({
          width: node.clientWidth,
          overflows: node.scrollHeight > node.clientHeight,
          controls: [...node.querySelectorAll("#wallpaper-categories [data-key]")].map((control) => {
            const rect = control.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width };
          }),
        }));
      const beforePhotos = await wallpaperLayout();
      expect(beforePhotos.overflows).toBe(true);
      await page.locator('[data-key="wallpaper-categories:photo"]').click();
      const photos = await wallpaperLayout();
      expect(photos.overflows).toBe(false);
      expect(photos.width).toBe(beforePhotos.width);
      expect(photos.controls).toEqual(beforePhotos.controls);
      await page.locator('[data-key="wallpaper-categories:solid"]').click();
      await openCategory(page, "language");
      expect(
        await page
          .locator("#language")
          .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length),
      ).toBe(3);
      await openCategory(page, "appearance");
      await expect(page.locator("#settings-appearance [data-key]")).toHaveCount(8);
      await page.locator('[data-key="settings-appearance:mint"]').focus();
      await page.keyboard.press(language === "ar" ? "ArrowRight" : "ArrowLeft");
      await expect(page.locator('[data-settings-drawer="frame"]')).toHaveAttribute("data-expanded", "false");
      await expect(page.locator('[data-key="section:appearance"]')).toBeFocused();
      await openCategory(page, "appearance");
      await page.locator('[data-key="home-app-layout:grid"]').focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('[data-key="home-app-layout:grid"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('[data-section-pane="appearance"]')).toBeVisible();
      await expect(page.locator("#settings-appearance")).toBeVisible();

      const focusRing = page.locator('[data-settings-focus="content"]');
      const selectedOutlineStyle = selectedFocusThemes.has(theme) ? "solid" : "none";
      const activeTheme = page.locator(`#settings-appearance [data-key="settings-appearance:${theme}"]`);
      await activeTheme.focus();
      await expect(focusRing).toHaveAttribute("data-selected", "true");
      await expect(focusRing).toHaveCSS("outline-style", selectedOutlineStyle);
      await expect(focusRing).toHaveCSS("outline-offset", "-4px");
      if (selectedFocusThemes.has(theme)) {
        await expect(focusRing).toHaveCSS("outline-width", "2px");
        await expect(focusRing).toHaveCSS(
          "outline-color",
          await activeTheme.evaluate((node) => getComputedStyle(node).color),
        );
      }

      const medium = page.locator('[data-key="home-card-columns:4"]');
      await medium.focus();
      await expect(focusRing).not.toHaveAttribute("data-selected", "true");
      await expect(focusRing).toHaveCSS("outline-style", "none");
      await page.keyboard.press("Enter");
      await expect(medium).toHaveAttribute("aria-pressed", "true");
      await expect(medium).toBeFocused();
      await expect(focusRing).toHaveAttribute("data-selected", "true");
      await expect(focusRing).toHaveCSS("outline-style", selectedOutlineStyle);
      const selectedFill = await medium.evaluate((node) => getComputedStyle(node).background);
      await page.keyboard.press("ArrowRight");
      await expect(focusRing).not.toHaveAttribute("data-selected", "true");
      await expect(focusRing).toHaveCSS("outline-style", "none");
      await expect(medium).toHaveCSS("background", selectedFill);

      await openCategory(page, "weather");
      const display = page.locator('[data-key="weather-display"]');
      const locationName = page.locator('[data-key="weather-visibility"]');
      await expect(display).toBeFocused();
      if (["gloss", "mint"].includes(theme)) {
        const themeBackground = await page
          .locator(`[data-key="settings-appearance:${theme}"]`)
          .evaluate((node) => getComputedStyle(node).backgroundImage);
        await expect(display.locator('[data-settings-toggle-part="track"]')).toHaveCSS(
          "background-image",
          themeBackground,
        );
      }
      await page.keyboard.press("ArrowDown");
      await expect(locationName).toBeFocused();
      await page.keyboard.down("Space");
      await page.keyboard.down("Space");
      await page.keyboard.up("Space");
      await expect(locationName).toHaveAttribute("aria-checked", "true");
      await page.locator('[data-key="units:F"]').focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('[data-key="units:F"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('[data-key="units:C"]')).toBeVisible();
      await display.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('[data-section-pane="weather"] [data-settings-field]:visible')).toHaveCount(1);
      await expect(display).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(locationName).toHaveAttribute("aria-checked", "true");
      await expect(page.locator('[data-key="units:F"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('#editor [data-key][tabindex="0"]')).toHaveCount(1);
      await page.keyboard.press(language === "ar" ? "ArrowRight" : "ArrowLeft");
      await expect(page.locator('[data-settings-drawer="frame"]')).toHaveAttribute("data-expanded", "false");
      await expect(page.locator('[data-key="section:weather"]')).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}
