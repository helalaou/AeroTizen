const { test, expect } = require("./launcher_fixture.cjs");
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1"))
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0", "demo1", "demo2", "demo3"],
          background: "black",
          showWeather: false,
        }),
      );
  });
});
test("Home short/held OK, action menu, move/drop and Settings focus restoration", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  const first = page.locator("#grid > [data-id]").first();
  await expect(first).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toContainText("Would open YouTube");
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("data-moving", "true");
  await expect(page.locator("#toast")).toHaveText("Use the arrows to move it, OK to drop");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home[0])).toBe("demo0");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home.slice(0, 2))).toEqual(["demo1", "demo0"]);
  await expect(page.locator("#toast")).toBeHidden();
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#grid > [data-id]").nth(1)).toHaveAttribute("data-focused", "true");
  await page.reload();
  await expect(page.locator("#grid > [data-id]").first()).toHaveAttribute("data-id", "demo1");
  expect(errors).toEqual([]);
});
const openHome = async (page, home = ["demo0", "demo1"]) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate((home) => AeroTizen.settings.update({ home }), home);
  await expect(page.locator("#grid > [data-id]").first()).toBeFocused();
};
const openActions = async (page) => {
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
};
test("a short OK launches once despite repeats; Back from actions permits the next launch", async ({ page }) => {
  await openHome(page);
  await page.evaluate(() => {
    window.appLaunches = [];
    AeroTizen.apps.launch = (app) => window.appLaunches.push(app.id);
  });
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  expect(await page.evaluate(() => window.appLaunches)).toEqual([]);
  await page.keyboard.up("Enter");
  expect(await page.evaluate(() => window.appLaunches)).toEqual(["demo0"]);
  await openActions(page);
  expect(await page.evaluate(() => window.appLaunches)).toEqual(["demo0"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.appLaunches)).toEqual(["demo0", "demo0"]);
});
test("All apps actions add and remove a favourite without removing the app card", async ({ page }) => {
  await openHome(page, ["demo0"]);
  await page.locator("#apps-tab").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  const cards = page.locator("#grid > [data-id]");
  const count = await cards.count();
  const favourite = await cards.first().getAttribute("data-id");
  await page.evaluate((id) => AeroTizen.settings.update({ home: [id] }), favourite);
  await expect(cards.first()).toBeFocused();
  await openActions(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Remove from Home"]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([]);
  await expect(cards).toHaveCount(count);
  await expect(cards.first()).toBeFocused();
  await openActions(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Add to Home"]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([favourite]);
  await expect(cards).toHaveCount(count);
});
