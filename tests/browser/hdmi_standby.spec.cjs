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

test("the development button adds the active missing port and restores a working tile", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: { leaving: true } }));
  await page.addInitScript(() => {
    localStorage.setItem("aerotizen.settings.v1", JSON.stringify({ glassSettings: true }));
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
  await page.goto("http://127.0.0.1:8172/");
  await page.waitForFunction(() => AeroTizen.inputs.sourcesReady);
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
