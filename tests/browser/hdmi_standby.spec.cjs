const { test, expect } = require("./launcher_fixture.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");
test("selecting an HDMI input opens the Samsung viewer", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem("aerotizen.settings.v1", JSON.stringify({ background: "black", showWeather: false }));
    }
    window.hdmiCalls = [];
    window.tizen = {
      application: {
        getAppsInfo: (done) => done([]),
        launch(id, done) {
          window.hdmiCalls.push(id);
          done();
        },
      },
      systeminfo: {
        getPropertyValue(name, done) {
          if (name === "VIDEOSOURCE") done({ connected: [{ type: "HDMI", number: 2 }], disconnected: [] });
        },
      },
      tvwindow: {
        setSource(source, done) {
          window.hdmiCalls.push(source.type + " " + source.number);
          done();
        },
        show(done) {
          window.hdmiCalls.push("embedded");
          done();
        },
      },
    };
  });
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  const hdmiTile = page.getByRole("button", { name: "HDMI 2", exact: true });
  await hdmiTile.click();
  await expect.poll(() => page.evaluate(() => window.hdmiCalls)).toEqual(["HDMI 2", "org.tizen.tv-viewer"]);
  await expect(page.locator("body")).not.toHaveClass(/\btv\b/);
  expect(errors).toEqual([]);
});
// Flow: connected HDMI tile -> unplug/switch -> updated status or usable Home.
async function mockInput(page, { sourceType = "HDMI" } = {}) {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.addInitScript(
    ({ sourceType }) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          background: "black",
          showWeather: false,
          home: [],
          hideDisconnectedHdmi: false,
        }),
      );
      const tv = (window.inputTest = { connected: true, calls: [] });
      window.tizen = {
        application: { getAppsInfo: (done) => done([]) },
        systeminfo: {
          getPropertyValue(name, done, fail) {
            if (name !== "VIDEOSOURCE") return fail?.();
            const port = { type: sourceType, number: 1 };
            done({ connected: tv.connected ? [port] : [], disconnected: tv.connected ? [] : [port] });
          },
          addPropertyValueChangeListener(name, callback) {
            if (name === "VIDEOSOURCE") tv.changed = callback;
            return 1;
          },
          removePropertyValueChangeListener() {
            delete tv.changed;
          },
        },
        tvwindow: {
          getSource: () => ({ type: "HDMI", number: 1 }),
          setSource(source, done) {
            tv.calls.push("setSource");
            done();
          },
          show(done) {
            tv.calls.push("show");
            done();
          },
          hide(done) {
            tv.calls.push("hide");
            done?.();
          },
        },
      };
    },
    { sourceType },
  );
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  if (sourceType === "HDMI") await expect(page.locator("[data-input-card]")).toHaveAttribute("data-status", "active");
}
const exitKey = "ESC";
test(`remote ${exitKey} exits embedded Live TV fallback and restores Home control`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockInput(page, { sourceType: "TV" });
  const tile = page.getByRole("button", { name: "Live TV", exact: true });
  await expect(tile).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveClass(/\btv\b/);
  await page.evaluate((name) => {
    const code = AeroTizen.config.KEY[name];
    document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: code, bubbles: true, cancelable: true }));
  }, exitKey);
  await expect.poll(() => page.evaluate(() => AeroTizen.inputs.getSnapshot().playback)).toBe("idle");
  await page.evaluate((name) => {
    const code = AeroTizen.config.KEY[name];
    document.dispatchEvent(new KeyboardEvent("keyup", { keyCode: code, bubbles: true }));
  }, exitKey);
  await expect(page.locator("body")).not.toHaveClass(/\btv\b/);
  await expect(tile).toBeVisible();
  await expect(tile).toHaveAttribute("data-focused", "true");
  expect(await page.evaluate(() => window.inputTest.calls)).toEqual(["setSource", "show", "hide"]);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#home-tab")).toBeFocused();
  expect(errors).toEqual([]);
});
test("unplug clears ACTIVE and a stale visible tile cannot open a black input", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockInput(page);
  // Miss the firmware event; selection must refresh the old tile itself.
  await page.evaluate(() => {
    window.inputTest.connected = false;
  });
  await page.getByRole("button", { name: "HDMI 1", exact: true }).click();
  await expect(page.locator("[data-input-card]")).toHaveAttribute("data-status", "empty");
  await expect(page.locator("#toast")).toHaveText("Could not show HDMI 1");
  await expect(page.locator("body")).not.toHaveClass(/\btv\b/);
  expect(await page.evaluate(() => window.inputTest.calls)).toEqual([]);
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
  expect(errors).toEqual([]);
});
