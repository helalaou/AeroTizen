const { openCategory, closeSettings } = require("./drawer_helpers.cjs");
const { test, expect } = require("@playwright/test");

test("Preact standby overrides persist without confusing custom labels with device recognition", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1"))
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          background: "black",
          showWeather: false,
          hideDisconnectedHdmi: true,
          inputNames: { "HDMI 2": "Custom console label" },
        }),
      );
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.inputs.sources.length === 4);
  await expect(page.locator("#inputs")).toContainText("PC");
  await expect(page.locator("#inputs")).not.toContainText("Custom console label");
  await page.locator("#gear").click();
  await openCategory(page, "sources");
  await page.locator('[data-key="hdmi-keep:2:true"]').click();
  await closeSettings(page);
  await expect(page.locator("#inputs")).toContainText("Custom console label");
  await page.reload();
  await expect(page.locator("#inputs")).toContainText("Custom console label");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().hdmiKeepVisible["2"])).toBe(true);
  await page.locator("#gear").click();
  await openCategory(page, "sources");
  await page.locator('[data-key="hdmi-keep:2:false"]').click();
  await closeSettings(page);
  await expect(page.locator("#inputs")).not.toContainText("Custom console label");
  expect(errors).toEqual([]);
});

test("HDMI playback preference survives reload and changes how the Inputs tile opens", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
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
  await expect.poll(() => page.evaluate(() => window.hdmiCalls)).toEqual(["HDMI 2", "embedded"]);

  await page.reload();
  await page.locator("#gear").click();
  await openCategory(page, "sources");
  await expect(page.getByRole("button", { name: "Inside AeroTizen" })).toHaveAttribute("aria-pressed", "true");
  const samsungViewer = page.getByRole("button", { name: "Samsung viewer", exact: true });
  await samsungViewer.click();
  await expect(samsungViewer).toHaveAttribute("aria-pressed", "true");
  await page.reload();

  await hdmiTile.click();
  await expect.poll(() => page.evaluate(() => window.hdmiCalls)).toEqual(["HDMI 2", "org.tizen.tv-viewer"]);
  expect(errors).toEqual([]);
});

for (const hidesLauncher of [true, false]) {
  test(`Samsung HDMI viewer ${hidesLauncher ? "does not warn after a quick Home return" : "warns if it never takes focus"}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((hide) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ background: "black", showWeather: false, hdmiNativeViewer: true }),
      );
      window.viewerAccepted = false;
      window.tizen = {
        application: {
          getAppsInfo: (done) => done([]),
          launch(_id, done) {
            done();
            window.viewerAccepted = true;
            if (hide) {
              Object.defineProperty(document, "hidden", { configurable: true, value: true });
              document.dispatchEvent(new Event("visibilitychange"));
              Object.defineProperty(document, "hidden", { configurable: true, value: false });
              document.dispatchEvent(new Event("visibilitychange"));
            }
          },
        },
        systeminfo: {
          getPropertyValue(name, done) {
            if (name === "VIDEOSOURCE") done({ connected: [{ type: "HDMI", number: 2 }], disconnected: [] });
          },
        },
        tvwindow: { setSource: (_source, done) => done() },
      };
    }, hidesLauncher);
    await page.goto("/");
    await page.getByRole("button", { name: "HDMI 2", exact: true }).click();
    await page.waitForFunction(() => window.viewerAccepted);
    if (hidesLauncher) {
      // Wait past the production focus deadline to prove the warning remains absent.
      await page.waitForTimeout(2300);
      await expect(page.locator("#toast")).toBeHidden();
    } else {
      await expect(page.locator("#toast")).toHaveText("Samsung viewer did not open HDMI 2");
    }
    expect(errors).toEqual([]);
  });
}

// Flow: connected HDMI tile -> unplug/switch -> updated status or usable Home.
async function mockHdmi(page, { stage = "ready", hideDisconnected = false } = {}) {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(
    ({ stage, hideDisconnected }) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          background: "black",
          showWeather: false,
          home: [],
          hideDisconnectedHdmi: hideDisconnected,
        }),
      );
      const tv = (window.inputTest = { connected: true, calls: [], stage });
      window.tizen = {
        application: { getAppsInfo: (done) => done([]) },
        systeminfo: {
          getPropertyValue(name, done, fail) {
            if (name !== "VIDEOSOURCE") return fail?.();
            const port = { type: "HDMI", number: 1 };
            done({ connected: tv.connected ? [port] : [], disconnected: tv.connected ? [] : [port] });
          },
          addPropertyValueChangeListener(name, callback) {
            if (name === "VIDEOSOURCE") tv.changed = callback;
          },
        },
        tvwindow: {
          getSource: () => ({ type: "HDMI", number: 1 }),
          setSource(source, done) {
            tv.calls.push("setSource");
            if (tv.stage === "setSource") tv.complete = done;
            else done();
          },
          show(done) {
            tv.calls.push("show");
            if (tv.stage === "show") tv.complete = done;
            else done();
          },
          hide(done) {
            tv.calls.push("hide");
            done?.();
          },
        },
      };
    },
    { stage, hideDisconnected },
  );
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  await expect(page.locator("[data-input-card]")).toHaveAttribute("data-status", "active");
}

test("unplug clears ACTIVE and a stale visible tile cannot open a black input", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockHdmi(page);
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

test("hot unplug removes an empty selected HDMI port with filtering enabled", async ({ page }) => {
  await mockHdmi(page, { hideDisconnected: true });
  await page.evaluate(() => {
    window.inputTest.connected = false;
    window.inputTest.changed();
  });
  await expect(page.locator("[data-input-card]")).toHaveCount(0);
  await expect(page.locator("#gear")).toBeVisible();
});

test("foreground polling corrects an unplug even without a firmware event", async ({ page }) => {
  await page.clock.install();
  await mockHdmi(page, { hideDisconnected: true });
  await page.evaluate(() => {
    window.inputTest.connected = false;
  });
  await page.clock.fastForward(5100);
  await expect(page.locator("[data-input-card]")).toHaveCount(0);
});

test("unplug during playback returns to usable Home", async ({ page }) => {
  await mockHdmi(page);
  await page.getByRole("button", { name: "HDMI 1", exact: true }).click();
  await expect(page.locator("body")).toHaveClass(/\btv\b/);
  await page.evaluate(() => {
    window.inputTest.connected = false;
    window.inputTest.changed();
  });
  await expect(page.locator("body")).not.toHaveClass(/\btv\b/);
  await expect(page.locator("#gear")).toBeVisible();
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
});

for (const stage of ["setSource", "show"]) {
  test(`remote Back cancels pending ${stage} and ignores a late callback`, async ({ page }) => {
    await mockHdmi(page, { stage });
    await page.getByRole("button", { name: "HDMI 1", exact: true }).click();
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.watching)).toBe(true);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 10009, bubbles: true })));
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.watching)).toBe(false);
    await page.evaluate(() => window.inputTest.complete());
    await expect(page.locator("body")).not.toHaveClass(/\btv\b/);
    await page.locator("#gear").click();
    await expect(page.locator("#editor")).toBeVisible();
  });

  test(`pending ${stage} times out and restores Home`, async ({ page }) => {
    await page.clock.install();
    await mockHdmi(page, { stage });
    await page.getByRole("button", { name: "HDMI 1", exact: true }).click();
    await page.clock.fastForward(8100);
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.watching)).toBe(false);
    await expect(page.locator("#toast")).toHaveText("Could not show HDMI 1");
    await page.locator("#gear").click();
    await expect(page.locator("#editor")).toBeVisible();
  });
}
