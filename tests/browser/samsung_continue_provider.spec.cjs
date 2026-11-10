const { test, expect } = require("@playwright/test");
const { watcherStatus } = require("./watcher_helpers.cjs");

for (const [build, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${build} typed Samsung provider preserves feed identity, cancellation and native handoff ownership`, async ({
    page,
  }) => {
    const errors = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) =>
      route.fulfill({ json: watcherStatus(route.request().url()) }),
    );
    await page.route("http://localhost:9013/**", (route) => {
      requests.push(route.request().url());
      return route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        json: [
          {
            app_id: "3201910019365",
            content_id: "episode",
            content_title: "Provider test episode",
            payload: '{"route":"episode://1","unicode":"é"}',
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
          background: "black",
          showWeather: false,
          continueWatching: true,
          continueWatchingApps: ["org.tizen.primevideo"],
        }),
      );
      window.nativeFeedLaunches = [];
      window.tizen = {
        application: {
          getAppsInfo: (done) =>
            done([
              { id: "org.tizen.primevideo", name: "Prime Video", packageId: "prime" },
              { id: "hidden.service", show: false, packageId: "prime" },
            ]),
          getAppMetaData: (id) =>
            id === "hidden.service"
              ? [{ key: "http://samsung.com/tv/metadata/use.continue_watching", value: "bg_service" }]
              : [],
          launchAppControl: (control, id, done, failed) => window.nativeFeedLaunches.push({ control, id, failed }),
        },
        ApplicationControl: function (operation, uri, mime, category, data) {
          Object.assign(this, { operation, data });
        },
        ApplicationControlData: function (key, value) {
          Object.assign(this, { key, value });
        },
      };
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    const card = page.locator("#continue-items > [data-key]");
    await expect(card).toHaveText(/Provider test episode/);
    expect(requests).toHaveLength(1);
    expect(await page.evaluate(() => "continueWatchingProviders" in AeroTizen)).toBe(false);
    await page.evaluate(() => {
      window.savedFeedCard = document.querySelector("#continue-items > [data-key]");
      window.savedFeedItems = AeroTizen.continueWatching.getSnapshot().items;
      AeroTizen.continueWatching.refresh();
    });
    await expect.poll(() => requests.length).toBe(2);
    await expect
      .poll(() => page.evaluate(() => AeroTizen.continueWatching.getSnapshot().sources[0].status))
      .toBe("1 item");
    expect(
      await page.evaluate(
        () =>
          window.savedFeedItems === AeroTizen.continueWatching.getSnapshot().items &&
          window.savedFeedCard === document.querySelector("#continue-items > [data-key]"),
      ),
    ).toBe(true);
    expect(new Set(requests).size).toBe(2);
    await page.evaluate(() => {
      AeroTizen.homewatch.prepareAppLaunch = (_, ready) => {
        window.feedReady = ready;
      };
    });
    await card.click();
    expect(await page.evaluate(() => window.nativeFeedLaunches.length)).toBe(0);
    await page.evaluate(() => {
      AeroTizen.settings.update({ continueWatching: false });
      window.feedReady();
    });
    expect(await page.evaluate(() => window.nativeFeedLaunches.map(({ id, control }) => ({ id, control })))).toEqual([
      {
        id: "org.tizen.primevideo",
        control: {
          operation: "http://tizen.org/appcontrol/operation/view",
          data: [{ key: "PAYLOAD", value: [JSON.stringify({ values: '{"route":"episode://1","unicode":"é"}' })] }],
        },
      },
    ]);
    await page.evaluate(() => AeroTizen.settings.update({ continueWatching: true }));
    await expect(card).toHaveText(/Provider test episode/);
    await card.click();
    await page.evaluate(() => {
      AeroTizen.continueWatching.dispose();
      window.feedReady();
      window.nativeFeedLaunches[0].failed({ name: "Late failure" });
    });
    expect(await page.evaluate(() => window.nativeFeedLaunches.length)).toBe(1);
    await expect(page.locator("#toast")).toBeHidden();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
