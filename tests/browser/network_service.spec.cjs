const { test, expect } = require("@playwright/test");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} network status uses one poller, skips unchanged notifications, and releases resources`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["test.app"],
          background: "black",
          showWeather: false,
          showNetwork: true,
        }),
      );
      const state = (window.networkFixture = {
        kind: "WIFI",
        reads: 0,
        notifications: 0,
        watches: new Map(),
        intervals: new Set(),
        removed: [],
        listener: null,
      });
      const setInterval = window.setInterval.bind(window);
      const clearInterval = window.clearInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const id = setInterval(callback, delay, ...args);
        if (delay === 60_000) state.intervals.add(id);
        return id;
      };
      window.clearInterval = (id) => {
        state.intervals.delete(id);
        clearInterval(id);
      };
      window.tizen = {
        application: {
          getAppsInfo: (done) => done([{ id: "test.app", name: "Test app", packageId: "1234567890" }]),
          launchAppControl() {},
        },
        systeminfo: {
          getPropertyValue(name, done, fail) {
            if (name === "NETWORK") {
              state.reads++;
              done({ networkType: state.kind });
            } else if (name === "WIFI_NETWORK") done({ signalStrength: 0.5 });
            else if (name === "VIDEOSOURCE") done({ connected: [], disconnected: [] });
            else fail?.();
          },
          addPropertyValueChangeListener(name, listener) {
            if (name === "NETWORK") {
              state.watches.set(0, listener);
              state.listener = listener;
              return 0;
            }
            return 1;
          },
          removePropertyValueChangeListener(id) {
            state.removed.push(id);
            state.watches.delete(id);
          },
        },
      };
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    await expect(page.locator("#network")).toHaveAttribute("data-net-kind", "wifi");
    await expect(page.locator("#network")).toHaveAttribute("data-net-level", "0.5");
    await page.evaluate(() => {
      AeroTizen.network.subscribe(() => window.networkFixture.notifications++);
      AeroTizen.network.start();
      AeroTizen.network.start();
    });
    const counts = () =>
      page.evaluate(() => ({
        reads: window.networkFixture.reads,
        polls: window.networkFixture.intervals.size,
        watches: window.networkFixture.watches.size,
        notifications: window.networkFixture.notifications,
      }));
    expect(await counts()).toEqual({ reads: 1, polls: 1, watches: 1, notifications: 0 });
    await page.clock.fastForward(60_000);
    expect(await counts()).toEqual({ reads: 2, polls: 1, watches: 1, notifications: 0 });
    await page.evaluate(() => AeroTizen.settings.update({ background: "snow" }));
    expect(await counts()).toEqual({ reads: 2, polls: 1, watches: 1, notifications: 0 });
    await page.evaluate(() => AeroTizen.settings.update({ showNetwork: false }));
    await expect(page.locator("#network")).toBeHidden();
    await page.evaluate(() => AeroTizen.settings.update({ showNetwork: true }));
    await expect(page.locator("#network")).toBeVisible();
    expect(await counts()).toEqual({ reads: 2, polls: 1, watches: 1, notifications: 2 });
    await page.evaluate(() => {
      window.networkFixture.kind = "ETHERNET";
      window.networkFixture.listener();
    });
    await expect(page.locator("#network")).toHaveAttribute("data-net-kind", "ethernet");
    expect(await counts()).toEqual({ reads: 3, polls: 1, watches: 1, notifications: 3 });
    await page.evaluate(() => {
      AeroTizen.network.dispose();
      AeroTizen.network.dispose();
      window.networkFixture.listener();
      window.dispatchEvent(new Event("online"));
      AeroTizen.settings.update({ showNetwork: false });
    });
    await page.clock.fastForward(60_000);
    expect(await counts()).toEqual({ reads: 3, polls: 0, watches: 0, notifications: 3 });
    expect(await page.evaluate(() => window.networkFixture.removed)).toEqual([0]);
    expect(errors).toEqual([]);
  });
}
