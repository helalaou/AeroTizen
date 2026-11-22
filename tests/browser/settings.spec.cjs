const { openCategory } = require("./drawer_helpers.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");
const { test, expect } = require("./launcher_fixture.cjs");
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) messages.push(message.text());
  });
  // All weather lookups are fixtures; no entered location leaves the test.
  await page.route("https://**/*", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
const openSettings = async (page, waitForApps = true) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.AeroTizen?.settingsUi && Array.isArray(AeroTizen.settings.getSnapshot().home),
  );
  if (waitForApps) await page.waitForFunction(() => AeroTizen.apps.getSnapshot().all.length > 0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    AeroTizen.settings.update({ background: "black", timeFormat: "24", showTime: true });
    AeroTizen.settingsUi.open();
  });
  await expect(page.locator("#editor")).toBeVisible();
  await expect(page.locator('[data-key="section:appearance"]')).toHaveAttribute("data-focused", "true");
  await openCategory(page, "wallpaper");
  await page.locator('[data-key="bg:black"]').click();
};
test("compiled Settings escape waits for /leave before launching native Samsung Home by remote", async ({ page }) => {
  await page.addInitScript(() => {
    window.nativeLaunches = [];
    window.tizen = {
      ApplicationControl: function (operation) {
        this.operation = operation;
      },
      application: {
        getAppsInfo: (done) => done([{ id: "test.app", name: "Test app", packageId: "1234567890" }]),
        launch(id, done) {
          window.nativeLaunches.push(id);
          done?.();
        },
        launchAppControl() {},
      },
      systeminfo: {
        getPropertyValue(name, done, fail) {
          fail?.();
        },
        addPropertyValueChangeListener() {},
      },
    };
  });
  let acknowledge;
  await page.route(
    "http://127.0.0.1:47790/leave",
    (route) =>
      new Promise((resolve) => {
        acknowledge = async () => {
          await route.fulfill({ json: watcherStatus(route.request().url()) });
          resolve();
        };
      }),
  );
  await openSettings(page);
  await page.keyboard.press("Escape");
  const escape = page.locator("#editor").getByRole("button", { name: "Samsung Home", exact: true });
  for (let step = 0; step < 7; step++) await page.keyboard.press("ArrowDown");
  await expect(escape).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => typeof acknowledge).toBe("function");
  expect(await page.evaluate(() => window.nativeLaunches)).toEqual([]);
  await acknowledge();
  await expect.poll(() => page.evaluate(() => window.nativeLaunches)).toEqual(["com.samsung.tv.csfs"]);
  expect(await page.evaluate(() => AeroTizen.homewatch.isLeaving())).toBe(false);
});
