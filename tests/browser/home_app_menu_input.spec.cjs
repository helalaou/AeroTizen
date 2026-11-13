const { test, expect } = require("./launcher_fixture.cjs");

const openHome = async (page, theme, language = "en") => {
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
  await page.addInitScript(
    ({ theme, language }) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          theme,
          language,
          home: ["demo0", "demo1", "demo2", "demo3"],
          background: "black",
          showWeather: false,
        }),
      );
    },
    { theme, language },
  );
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await expect(page.locator('#grid > [data-id="demo0"]')).toBeFocused();
  await page.evaluate(() => {
    window.menuLaunches = [];
    AeroTizen.apps.launch = (app) => window.menuLaunches.push(app.id);
  });
  await page.clock.install();
};

const holdOpen = async (page) => {
  await page.keyboard.down("Enter");
  await page.clock.runFor(await page.evaluate(() => AeroTizen.config.LONG_PRESS_MS));
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menu")).toBeFocused();
};
const openMenu = async (page) => {
  await holdOpen(page);
  await page.keyboard.up("Enter");
};

for (const theme of ["classic", "glass"]) {
  test(`${theme} the opening hold belongs to Home and cannot select a menu action`, async ({ page }, info) => {
    await openHome(page, theme);
    const origin = page.locator('#grid > [data-id="demo0"]');
    await holdOpen(page);
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(origin).not.toHaveAttribute("data-moving", "true");
    await expect(page.getByRole("menuitem", { name: "Move", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    const remove = page.getByRole("menuitem", { name: "Remove from Home", exact: true });
    await expect(remove).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("menu")).toHaveAttribute("aria-activedescendant", await remove.getAttribute("id"));
    await page.screenshot({ path: info.outputPath("scoped-app-menu.png") });
    await page.keyboard.down("Escape");
    await page.keyboard.down("Escape");
    await page.keyboard.up("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(origin).toBeFocused();
    expect(await page.evaluate(() => window.menuLaunches)).toEqual([]);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.menuLaunches)).toEqual(["demo0"]);
  });

  test(`${theme} a held menu confirmation cannot drop a move or launch the app`, async ({ page }) => {
    await openHome(page, theme);
    const origin = page.locator('#grid > [data-id="demo0"]');
    await openMenu(page);
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(origin).toHaveAttribute("data-moving", "true");
    await expect(origin).toBeFocused();
    expect(await page.evaluate(() => window.menuLaunches)).toEqual([]);
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home.slice(0, 2))).toEqual(["demo0", "demo1"]);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home.slice(0, 2))).toEqual(["demo1", "demo0"]);
    await expect(origin).not.toHaveAttribute("data-moving", "true");
    expect(await page.evaluate(() => window.menuLaunches)).toEqual([]);
  });

  test(`${theme} All apps shares Add and Remove commands across remote and pointer`, async ({ page }) => {
    await openHome(page, theme);
    await page.evaluate(() => AeroTizen.settings.update({ home: [] }));
    await page.locator("#apps-tab").click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    const origin = page.locator("#grid > [data-id]").first();
    await expect(origin).toBeFocused();
    const id = await origin.getAttribute("data-id");
    await openMenu(page);
    await expect(page.getByRole("menuitem")).toHaveText(["Add to Home"]);
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([id]);
    await expect(origin).toBeFocused();
    expect(await page.evaluate(() => window.menuLaunches)).toEqual([]);
    await openMenu(page);
    await page.getByRole("menuitem", { name: "Remove from Home", exact: true }).click();
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([]);
    await expect(origin).toBeFocused();
  });

  test(`${theme} Home refresh preserves menu focus and deleting its app cancels held input`, async ({ page }) => {
    await openHome(page, theme);
    await openMenu(page);
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => AeroTizen.homeScreen.render());
    await expect(page.getByRole("menu")).toBeFocused();
    await expect(page.getByRole("menuitem", { name: "Remove from Home", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.down("ArrowDown");
    await page.evaluate(() => AeroTizen.settings.update({ home: ["demo1", "demo2", "demo3"] }));
    const next = page.locator('#grid > [data-id="demo1"]');
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(next).toBeFocused();
    await page.keyboard.down("ArrowDown");
    await page.keyboard.up("ArrowDown");
    await expect(next).toBeFocused();
    expect(await page.evaluate(() => window.menuLaunches)).toEqual([]);
  });

  test(`${theme} opening Settings cancels the menu's held key before it can navigate Settings`, async ({ page }) => {
    await openHome(page, theme);
    await openMenu(page);
    await page.keyboard.down("ArrowDown");
    await page.evaluate(() => AeroTizen.settingsUi.open());
    await expect(page.getByRole("menu")).toBeHidden();
    await page.keyboard.down("ArrowDown");
    await page.keyboard.up("ArrowDown");
    await expect(page.locator('[data-key="section:appearance"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    await expect(page.locator('#grid > [data-id="demo0"]')).toBeFocused();
  });

  test(`${theme} the Arabic menu owns horizontal input and Tab restores app focus`, async ({ page }) => {
    await openHome(page, theme, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await openMenu(page);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("menuitem").nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menuitem").nth(0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(page.locator('#grid > [data-id="demo0"]')).toBeFocused();
  });
}
