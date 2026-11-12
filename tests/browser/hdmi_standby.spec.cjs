const { openCategory, closeSettings } = require("./drawer_helpers.cjs");
const { test, expect } = require("./launcher_fixture.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");

test("Preact standby overrides persist without confusing custom labels with device recognition", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
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
  await page.waitForFunction(() => AeroTizen.inputs.getSnapshot().sources.length === 4);
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
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
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
    await page.route("http://127.0.0.1:47790/**", (route) =>
      route.fulfill({ json: watcherStatus(route.request().url()) }),
    );
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
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
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
  await expect(page.locator("#toast")).toHaveText("HDMI 1 disconnected");
  await expect(page.locator("#gear")).toBeVisible();
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
});

for (const stage of ["setSource", "show"]) {
  test(`remote Back cancels pending ${stage} and ignores a late callback`, async ({ page }) => {
    await mockHdmi(page, { stage });
    await page.getByRole("button", { name: "HDMI 1", exact: true }).click();
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.getSnapshot().playback !== "idle")).toBe(true);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 10009, bubbles: true })));
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.getSnapshot().playback !== "idle")).toBe(false);
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
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.getSnapshot().playback !== "idle")).toBe(false);
    await expect(page.locator("#toast")).toHaveText("Could not show HDMI 1");
    await page.locator("#gear").click();
    await expect(page.locator("#editor")).toBeVisible();
  });
}

test("the standard launcher adds the active missing port and restores a working tile", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("aerotizen.settings.v1", JSON.stringify({ theme: "glass" }));
    const listeners = new Map();
    let nextListener = 0;
    const reported = [1, 2, 3, 4].map((number) => ({ type: "HDMI", number }));
    window.ipControlActions = [];
    window.tizen = {
      ApplicationControl: function (operation) {
        this.operation = operation;
      },
      application: {
        getAppsInfo: (done) => done([]),
        launchAppControl() {},
        launch(id, done) {
          window.ipControlActions.push({ action: "launch", id });
          done?.();
        },
      },
      systeminfo: {
        getPropertyValue(name, done, fail) {
          if (name === "VIDEOSOURCE") {
            done({ connected: reported });
          } else {
            fail?.();
          }
        },
        addPropertyValueChangeListener() {},
      },
      messageport: {
        requestTrustedLocalMessagePort() {
          return {
            addMessagePortListener(listener) {
              nextListener += 1;
              listeners.set(nextListener, listener);
              return nextListener;
            },
            removeMessagePortListener: (id) => listeners.delete(id),
          };
        },
        requestTrustedRemoteMessagePort() {
          return {
            sendMessage([{ key, value }]) {
              const command = JSON.parse(value);
              window.ipControlActions.push(command);
              const ports = JSON.parse(sessionStorage.getItem("learned-hdmi") || "[]");
              let reply = { status: "listed", ports };
              if (command.action === "learn") {
                sessionStorage.setItem("learned-hdmi", "[5]");
                reply = { status: "added", port: 5, ports: [5] };
              } else if (command.action === "switch") {
                reply = { status: "switched" };
              }
              queueMicrotask(() => {
                for (const listener of listeners.values()) {
                  listener([{ key, value: JSON.stringify(reply) }]);
                }
              });
            },
          };
        },
      },
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.inputs.getSnapshot().sources.length === 4);
  const tile = page.getByRole("button", { name: "HDMI 5", exact: true });
  await expect(tile).toHaveCount(0);
  await page.locator("#gear").click();
  await openCategory(page, "sources");
  const add = page.getByRole("button", { name: "Find and add input" });
  await add.click();
  const toast = page.locator("#toast");
  await expect(toast).toHaveText("HDMI 5 added to Home.");
  await expect(toast).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-section-pane="sources"]')).not.toContainText("HDMI 5 added to Home.");
  await expect(add).toBeFocused();
  const focus = page.locator("[data-settings-focus=content]");
  await expect(focus).toHaveAttribute("data-visible", "true");
  await expect
    .poll(() =>
      focus.evaluate((indicator) => {
        const ring = indicator.getBoundingClientRect();
        const button = document.activeElement.getBoundingClientRect();
        return Math.max(Math.abs(ring.x - button.x), Math.abs(ring.y - button.y));
      }),
    )
    .toBeLessThan(2);
  expect(await page.evaluate(() => window.ipControlActions.find((command) => command.action === "learn"))).toEqual({
    action: "learn",
    nativePorts: [1, 2, 3, 4],
  });
  await closeSettings(page);
  await expect(tile).toBeVisible();
  await page.reload();
  await expect(tile).toBeVisible();
  await tile.click();
  await expect
    .poll(() => page.evaluate(() => window.ipControlActions.slice(-2)))
    .toEqual([
      { action: "switch", port: 5 },
      { action: "launch", id: "org.tizen.tv-viewer" },
    ]);
  expect(errors).toEqual([]);
});

test.describe("missing-input development preview", () => {
  test.use({ previewPlatforms: false });
  test("the development preview discovers a missing input through the shared input service", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:8172/?mockHdmi=5");
    await page.locator("#gear").click();
    await openCategory(page, "sources");
    await page.getByRole("button", { name: "Find and add input" }).click();
    await expect(page.locator("#toast")).toHaveText("HDMI 5 added to Home.");
    await closeSettings(page);
    const tile = page.getByRole("button", { name: "HDMI 5", exact: true });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page.locator("#toast")).toHaveText("Would switch to HDMI 5");
    expect(errors).toEqual([]);
  });
});
