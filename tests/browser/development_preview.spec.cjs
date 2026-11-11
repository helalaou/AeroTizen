const { test, expect } = require("./launcher_fixture.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");

test.use({ previewPlatforms: false });
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
});

for (const [build, origin] of [
  ["production", "http://127.0.0.1:8171"],
  ["TV-dev", "http://127.0.0.1:8173"],
]) {
  test(`${build} has no sample inventory or feed, including with the old demo query`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of ["/", "/?demo=1"]) {
      await page.goto(origin + path);
      await expect(page).toHaveTitle("AeroTizen");
      await page.waitForFunction(() =>
        window.AeroStartup?.trace.marks.some((mark) => mark.name === "apps-unavailable"),
      );
      expect(
        await page.evaluate(() => ({
          apps: AeroTizen.apps.getSnapshot().all.length,
          inputs: AeroTizen.inputs.getSnapshot().sources.length,
          feed: AeroTizen.continueWatching.getSnapshot().items.length,
          overrides: typeof AeroTizen.platforms,
        })),
      ).toEqual({ apps: 0, inputs: 0, feed: 0, overrides: "undefined" });
      const { theme, homeCardColumns, homeAppLayout, continueWatching } = await page.evaluate(() =>
        AeroTizen.settings.getSnapshot(),
      );
      expect({ theme, homeCardColumns, homeAppLayout, continueWatching }).toEqual({
        theme: "classic",
        homeCardColumns: 3,
        homeAppLayout: "grid",
        continueWatching: false,
      });
      await expect(page.locator("#gear")).toBeVisible();
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test("local preview keeps existing ordinary settings ahead of old demo settings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        timeFormat: "24",
        theme: "classic",
        homeCardColumns: 4,
        homeAppLayout: "grid",
        home: [],
        homeInitialized: true,
        continueWatching: false,
      }),
    );
    localStorage.setItem("aerotizen.settings.v1.demo", JSON.stringify({ timeFormat: "12", theme: "glass" }));
  });
  await page.goto("http://127.0.0.1:8172/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  expect(
    await page.evaluate(() => ({
      key: AeroTizen.config.STORAGE_KEY,
      format: AeroTizen.settings.getSnapshot().timeFormat,
      theme: AeroTizen.settings.getSnapshot().theme,
      home: AeroTizen.settings.getSnapshot().home,
    })),
  ).toEqual({ key: "aerotizen.settings.v1", format: "24", theme: "classic", home: [] });
  await expect(page.locator("#grid")).toHaveAttribute("data-columns", "4");
  await expect(page.locator("#grid")).toHaveAttribute("data-scroll", "false");
  await expect(page.locator("#continue-section")).toBeHidden();
});

test("local preview carries over old demo preferences when ordinary settings do not exist", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aerotizen.settings.v1.demo", JSON.stringify({ timeFormat: "24", theme: "classic" }));
  });
  await page.goto("http://127.0.0.1:8172/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().timeFormat)).toBe("24");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().theme)).toBe("classic");
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(7);
  expect(await page.evaluate(() => localStorage.getItem("aerotizen.settings.v1"))).not.toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1.demo")).timeFormat)).toBe(
    "24",
  );
});

test("local preview still opens when browser storage is blocked", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await page.goto("http://127.0.0.1:8172/");
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(7);
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  expect(await page.evaluate(() => AeroTizen.apps.getSnapshot().all.length)).toBe(25);
  expect(errors).toEqual([]);
});

test("the Vite entry respects a supplied native SDK even with the old demo query", async ({ page }) => {
  await page.addInitScript(() => {
    window.tizen = {
      application: {
        getAppsInfo(done) {
          done([{ id: "installed.app", name: "Installed app", packageId: "abcdefghij" }]);
        },
        getAppMetaData: () => [],
      },
    };
  });
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.goto("http://127.0.0.1:8172/?demo=1");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  expect(await page.evaluate(() => AeroTizen.apps.getSnapshot().all.map((app) => app.id))).toEqual(["installed.app"]);
  expect(await page.evaluate(() => AeroTizen.inputs.getSnapshot().sources)).toEqual([]);
  expect(await page.evaluate(() => AeroTizen.continueWatching.getSnapshot().items)).toEqual([]);
});
