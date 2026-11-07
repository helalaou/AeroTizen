const { test, expect } = require("@playwright/test");

const errors = new WeakMap();
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (e) => errors.get(page).push(e.message));
  await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
  await page.addInitScript(() =>
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        background: "black",
        showWeather: false,
        home: ["demo0", "demo1", "demo2"],
        clockLayout: "classic",
      }),
    ),
  );
});

test("held OK is cancelled if the app loses visibility before its release", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.keyboard.down("Enter");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    AeroTizen.homeScreen.refreshApps();
  });
  await expect(page.locator("#home-root [data-focused=true]")).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.getByRole("menu")).toBeHidden();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.up("Enter");
  await expect(page.getByRole("menu")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toContainText("Would open YouTube");
});

for (const trigger of ["visibilitychange", "appcontrol", "failed launch"]) {
  test(`uninstalled apps disappear after ${trigger}`, async ({ page }) => {
    await page.addInitScript(() => {
      const tv = (window.testTv = {
        installed: [
          { id: "demo0", name: "Removed app", packageId: "1234567890" },
          { id: "demo1", name: "Other app", packageId: "abcdefghij" },
        ],
        requests: [],
      });
      window.tizen = {
        application: {
          getAppsInfo(done, fail) {
            tv.requests.push({ done, fail, installed: tv.installed });
          },
          launch(id, done, fail) {
            fail({ name: "NotFoundError" });
          },
        },
      };
    });
    await page.goto("/");
    await page.waitForFunction(() => window.testTv.requests.length === 1);
    await page.evaluate(() => {
      const { done, installed } = window.testTv.requests.shift();
      done(installed);
    });
    const removed = page.locator('#grid [data-id="demo0"]');
    const other = page.locator('#grid [data-id="demo1"]');
    await expect(removed).toBeVisible();
    await page.evaluate((event) => {
      const tv = window.testTv;
      // Keep an older read pending so its result can arrive after the refresh.
      AeroTizen.apps.load(() => {});
      tv.installed = tv.installed.slice(1);
      if (event === "visibilitychange") {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event(event));
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event(event));
      } else if (event === "appcontrol") {
        window.dispatchEvent(new Event(event));
      }
    }, trigger);
    if (trigger === "failed launch") {
      await page.keyboard.press("Enter");
      await expect(page.locator("#toast")).toHaveText("Could not open Removed app");
    }
    await page.waitForFunction(() => window.testTv.requests.length === 2);
    await page.evaluate(() => {
      const [older, refresh] = window.testTv.requests.splice(0);
      refresh.done(refresh.installed);
      older.done(older.installed);
    });
    await expect(removed).toHaveCount(0);
    await expect(other).toBeVisible();
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual(["demo0", "demo1", "demo2"]);
  });
}

test("moving visible favourites ignores stale uninstalled IDs in saved settings", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        background: "black",
        showWeather: false,
        home: ["demo0", "missing.app", "demo1", "demo2"],
      }),
    ),
  );
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await expect(page.locator("#grid > [data-id]")).toHaveCount(3);
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  expect(await page.locator("#grid > [data-id]").evaluateAll((nodes) => nodes.map((n) => n.dataset.id))).toEqual([
    "demo1",
    "demo0",
    "demo2",
  ]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual(["demo1", "demo0", "demo2"]);
});

test("an inventory refresh removing the moving app cannot delete another favourite", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator("#grid [data-id][data-moving=true]")).toHaveCount(1);
  await page.evaluate(() => {
    AeroTizen.apps.all = AeroTizen.apps.all.filter((app) => app.id !== "demo0");
    AeroTizen.homeScreen.refreshApps();
  });
  await expect(page.locator("#grid [data-id][data-moving=true]")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual(["demo0", "demo1", "demo2"]);
  expect(await page.locator("#grid > [data-id]").evaluateAll((nodes) => nodes.map((n) => n.dataset.id))).toEqual([
    "demo1",
    "demo2",
  ]);
});

test("source reachability keeps active, recognised and manually pinned inputs distinct from an empty port", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.evaluate(() => {
    AeroTizen.inputs.sources = [1, 2, 3, 4].map((number) => ({
      type: "HDMI",
      number,
      connected: false,
      active: number === 1,
    }));
    AeroTizen.inputs.isVisible = () => true;
    AeroTizen.inputs.hasRecognizedDevice = (source) => source.number === 2;
    AeroTizen.inputs.alwaysVisible = (source) => source.number === 3;
    AeroTizen.inputs.refresh();
  });
  const sources = page.locator("#inputs > [data-input-card]");
  await expect(sources).toHaveCount(4);
  for (let i = 0; i < 3; i++) await expect(sources.nth(i)).toHaveAttribute("data-disconnected", "false");
  await expect(sources.nth(3)).toHaveAttribute("data-disconnected", "true");
});
