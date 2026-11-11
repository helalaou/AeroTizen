const { test, expect } = require("./launcher_fixture.cjs");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} Continue Watching shares immutable state and releases its lifecycle`, async ({ page }) => {
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
    await page.route("http://localhost:9013/**", (route) => {
      requests.push(route.request().url());
      return route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        json: [
          {
            app_id: "3201910019365",
            content_id: "one",
            content_title: "Continue Watching lifecycle",
            payload: "saved-launch-data",
            timestamp: 1000,
          },
        ],
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["org.tizen.primevideo"],
          showWeather: false,
          background: "black",
          continueWatching: true,
          continueWatchingApps: ["org.tizen.primevideo"],
        }),
      );
      const listeners = (window.visibilityListeners = new Set());
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = (type, listener, options) => {
        if (type === "visibilitychange") listeners.add(listener);
        add(type, listener, options);
      };
      document.removeEventListener = (type, listener, options) => {
        if (type === "visibilitychange") listeners.delete(listener);
        remove(type, listener, options);
      };
      window.tizen = {
        application: {
          getAppsInfo: (done) => done([{ id: "org.tizen.primevideo", name: "Prime Video", packageId: "prime" }]),
          getAppMetaData: () => [
            { key: "http://samsung.com/tv/metadata/app_support_continue_watching", value: "true" },
          ],
        },
      };
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    const card = page.locator("#continue-items > [data-key]");
    await expect(card).toHaveText(/Continue Watching lifecycle/);
    await page.evaluate(() => {
      const owner = (window.continueOwner = AeroTizen.continueWatching);
      window.continueSnapshot = owner.getSnapshot();
      window.continueCard = document.querySelector("#continue-items > [data-key]");
      owner.start();
      owner.start();
    });
    expect(requests).toHaveLength(1);
    expect(
      await page.evaluate(() => {
        const owner = AeroTizen.continueWatching;
        const snapshot = owner.getSnapshot();
        return (
          snapshot === window.continueSnapshot &&
          [snapshot, snapshot.items, snapshot.items[0], snapshot.sources, snapshot.sources[0]].every(Object.isFrozen) &&
          !("items" in owner) &&
          !("sources" in owner)
        );
      }),
    ).toBe(true);
    await page.evaluate(() => AeroTizen.continueWatching.refresh());
    await expect.poll(() => requests.length).toBe(2);
    await expect
      .poll(() => page.evaluate(() => AeroTizen.continueWatching.getSnapshot().sources[0].status))
      .toBe("1 item");
    expect(
      await page.evaluate(
        () =>
          AeroTizen.continueWatching.getSnapshot().items === window.continueSnapshot.items &&
          document.querySelector("#continue-items > [data-key]") === window.continueCard,
      ),
    ).toBe(true);
    const listeners = await page.evaluate(() => window.visibilityListeners.size);
    await page.evaluate(() => {
      AeroTizen.continueWatching.dispose();
      AeroTizen.continueWatching.dispose();
    });
    expect(await page.evaluate(() => window.visibilityListeners.size)).toBe(listeners - 1);
    await page.evaluate(() => {
      AeroTizen.settings.update({ continueWatching: false });
      AeroTizen.settings.update({ continueWatching: true });
      AeroTizen.clock.tick();
      AeroTizen.continueWatching.start();
      AeroTizen.continueWatching.refresh();
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(requests).toHaveLength(2);
    expect(await page.evaluate(() => AeroTizen.continueWatching === window.continueOwner)).toBe(true);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
