const { test, expect } = require("@playwright/test");
const { watcherStatus } = require("./watcher_helpers.cjs");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${build} input service shares immutable source state and preserves unchanged Home and Settings nodes`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) =>
      route.fulfill({ json: watcherStatus(route.request().url()) }),
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: [], background: "black", showWeather: false, hideDisconnectedHdmi: false }),
      );
      const tv = (window.inputsTest = { reads: 0, watches: 0, removed: 0, hidden: 0, replies: [] });
      window.tizen = {
        application: { getAppsInfo: (done) => done([]), getAppMetaData: () => [] },
        systeminfo: {
          getPropertyValue(name, done, failed) {
            if (name === "VIDEOSOURCE") {
              tv.reads++;
              tv.replies.push(done);
            } else failed?.();
          },
          addPropertyValueChangeListener(name, callback) {
            if (name === "VIDEOSOURCE") {
              tv.changed = callback;
              tv.watches++;
            }
            return 1;
          },
          removePropertyValueChangeListener() {
            tv.removed++;
          },
        },
        tvwindow: {
          getSource: () => ({ type: "HDMI", number: 1 }),
          setSource: (_, done) => done(),
          show: (done) => done(),
          hide: () => tv.hidden++,
        },
      };
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    await page.waitForFunction(() => window.inputsTest?.replies.length === 1);
    await page.evaluate(() => {
      window.inputsTest.report = {
        connected: [
          { type: "HDMI", number: 1, editName: "Console" },
          { type: "TV", number: 1 },
        ],
        disconnected: [{ type: "HDMI", number: 2 }],
      };
      window.inputsTest.replies.shift()(window.inputsTest.report);
    });
    const cards = page.locator("#inputs > [data-input-card]");
    await expect(cards).toHaveCount(3);
    await page.locator("#gear").click();
    await page.locator('[data-key="section:sources"]').click();
    await expect(page.locator("#input-names input")).toHaveCount(2);
    const first = page.getByRole("textbox", { name: "HDMI 1 name", exact: true });
    await first.fill("Unsaved console name");
    await page.evaluate(() => {
      window.inputsTest.before = AeroTizen.inputs.getSnapshot();
      window.inputsTest.cards = [...document.querySelectorAll("#inputs > [data-input-card]")];
      window.inputsTest.nameField = document.querySelector('[data-key="name:HDMI 1"] input');
      AeroTizen.inputs.load();
      window.inputsTest.replies.shift()(JSON.parse(JSON.stringify(window.inputsTest.report)));
    });
    expect(
      await page.evaluate(() => {
        const s = AeroTizen.inputs.getSnapshot();
        return (
          s === window.inputsTest.before &&
          [s, s.sources, s.sources[0], s.visibleSources].every(Object.isFrozen) &&
          window.inputsTest.cards.every(
            (node, index) => node === document.querySelectorAll("#inputs > [data-input-card]")[index],
          ) &&
          window.inputsTest.nameField === document.querySelector('[data-key="name:HDMI 1"] input')
        );
      }),
    ).toBe(true);
    await expect(first).toHaveValue("Unsaved console name");
    await page.evaluate(() => {
      AeroTizen.settings.update({ hideDisconnectedHdmi: true, showLiveTv: false });
      AeroTizen.settingsUi.close();
    });
    await expect(cards).toHaveCount(1);
    expect(await page.evaluate(() => window.inputsTest.reads)).toBe(2);
    await expect(page.getByRole("button", { name: "Unsaved console name", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("inputs-service.png") });
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`${build} input disposal cancels source delivery, native watches and pending video presentation`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) =>
      route.fulfill({ json: watcherStatus(route.request().url()) }),
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: [], background: "black", showWeather: false, hideDisconnectedHdmi: false }),
      );
      const tv = (window.inputsTest = { reads: 0, removed: 0, shows: 0 });
      window.tizen = {
        application: { getAppsInfo: (done) => done([]) },
        systeminfo: {
          getPropertyValue(name, done, failed) {
            if (name !== "VIDEOSOURCE") return failed?.();
            tv.reads++;
            if (tv.defer) tv.lateRead = done;
            else done({ connected: [{ type: "HDMI", number: 1 }], disconnected: [] });
          },
          addPropertyValueChangeListener() {
            return 1;
          },
          removePropertyValueChangeListener() {
            tv.removed++;
          },
        },
        tvwindow: {
          setSource: (_, done) => {
            tv.lateSource = done;
          },
          show: (done) => {
            tv.shows++;
            done();
          },
          hide() {},
        },
      };
    });
    await page.goto(url);
    await page.getByRole("button", { name: "HDMI 1", exact: true }).click();
    await expect.poll(() => page.evaluate(() => AeroTizen.inputs.getSnapshot().playback)).toBe("opening");
    await page.evaluate(() => {
      window.inputsTest.defer = true;
      AeroTizen.inputs.load();
      AeroTizen.inputs.dispose();
      window.inputsTest.disposed = AeroTizen.inputs.getSnapshot();
      window.inputsTest.lateRead({ connected: [{ type: "HDMI", number: 2 }] });
      window.inputsTest.lateSource();
      AeroTizen.inputs.start();
      AeroTizen.inputs.load();
    });
    await expect(page.locator("body")).not.toHaveClass(/\btv\b/);
    await expect(page.locator("#gear")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        same: AeroTizen.inputs.getSnapshot() === window.inputsTest.disposed,
        playback: AeroTizen.inputs.getSnapshot().playback,
        shows: window.inputsTest.shows,
        removed: window.inputsTest.removed,
      })),
    ).toEqual({ same: true, playback: "idle", shows: 0, removed: 1 });
    expect(errors).toEqual([]);
  });
}
