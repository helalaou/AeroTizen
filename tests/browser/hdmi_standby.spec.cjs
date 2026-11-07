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
