const { test, expect } = require("./launcher_fixture.cjs");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} app service renders cached favourites, retains unchanged cards and ignores disposed discovery`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(message.text());
    });
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("**/opt/share/webappservice/apps_icon/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"><rect width="304" height="304" fill="#24334f"/></svg>',
      }),
    );
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
    await page.addInitScript(() => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["youtube", "video"], background: "black", showWeather: false }),
      );
      localStorage.setItem(
        "aerotizen.apps.v1",
        JSON.stringify([
          { id: "youtube", name: "Saved YouTube", icon: "" },
          { id: "video", name: "Saved Video", icon: "" },
        ]),
      );
      const replies = (window.discoveryReplies = []);
      window.nativeLaunches = [];
      window.installedApps = [
        { id: "youtube", name: "YouTube", packageId: "abcdefghij", iconPath: "" },
        { id: "video", name: "Video", packageId: "klmnopqrst", iconPath: "" },
      ];
      window.tizen = {
        application: {
          getAppsInfo: (done) => replies.push(done),
          getAppMetaData: () => [],
          launch: (id) => window.nativeLaunches.push(id),
        },
      };
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    await page.waitForFunction(() => window.discoveryReplies.length === 1);
    const cached = await page.evaluate(() => AeroTizen.apps.getSnapshot());
    expect(cached.ready).toBe(false);
    expect(cached.all.map((app) => app.name)).toEqual(["Saved YouTube", "Saved Video"]);
    const cards = page.locator("#grid > [data-id]");
    await expect(cards).toHaveCount(2);
    await page.evaluate(() => {
      window.appsOwner = AeroTizen.apps;
      window.discoveryReplies[0](window.installedApps);
    });
    await expect.poll(() => page.evaluate(() => AeroTizen.apps.getSnapshot().ready)).toBe(true);
    expect(
      await page.evaluate(() => {
        const snapshot = AeroTizen.apps.getSnapshot();
        window.appSnapshot = snapshot;
        window.appCards = [...document.querySelectorAll("#grid > [data-id]")];
        return (
          [snapshot, snapshot.all, snapshot.all[0], snapshot.inventory, snapshot.inventory[0], snapshot.realIds].every(
            Object.isFrozen,
          ) &&
          !("all" in AeroTizen.apps) &&
          !("ready" in AeroTizen.apps)
        );
      }),
    ).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toHaveAttribute("data-focused", "true");
    await page.evaluate(() => AeroTizen.apps.load());
    await page.waitForFunction(() => window.discoveryReplies.length === 2);
    await page.evaluate(() => window.discoveryReplies[1](window.installedApps.map((app) => ({ ...app }))));
    expect(
      await page.evaluate(
        () =>
          AeroTizen.apps.getSnapshot() === window.appSnapshot &&
          window.appCards.every((node, index) => node === document.querySelectorAll("#grid > [data-id]")[index]),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual(["youtube", "video"]);
    await page.screenshot({ path: info.outputPath("apps-service.png") });
    await page.evaluate(() => {
      AeroTizen.apps.load();
      AeroTizen.apps.dispose();
      AeroTizen.apps.dispose();
      window.discoveryReplies[2]([]);
      AeroTizen.apps.load();
      AeroTizen.apps.launch({ id: "youtube", name: "YouTube" });
      AeroTizen.apps.openStore();
    });
    expect(await page.evaluate(() => window.discoveryReplies.length)).toBe(3);
    expect(await page.evaluate(() => window.nativeLaunches)).toEqual([]);
    expect(
      await page.evaluate(
        () => AeroTizen.apps === window.appsOwner && AeroTizen.apps.getSnapshot() === window.appSnapshot,
      ),
    ).toBe(true);
    await expect(cards).toHaveCount(2);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`${name} appcontrol refreshes playback with an unchanged inventory and no visibility event`, async ({
    page,
  }) => {
    let title = "Before return";
    let reads = 0;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("http://127.0.0.1:47790/**", (route) =>
      route.fulfill({
        json: {
          homeControl: { protocol: 1, app_id: "DclHome001.Home", mode: "watcher" },
          heartbeats: 1,
        },
      }),
    );
    await page.route("**/opt/share/webappservice/apps_icon/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"/>',
      }),
    );
    await page.route("http://localhost:9013/**", (route) => {
      reads++;
      return route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        json: [
          {
            app_id: "3201910019365",
            content_id: "same",
            content_title: title,
            payload: "launch-data",
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
      window.appQueries = 0;
      window.tizen = {
        application: {
          getAppsInfo: (done) => {
            window.appQueries++;
            done([{ id: "org.tizen.primevideo", name: "Prime Video", packageId: "prime" }]);
          },
          getAppMetaData: () => [
            { key: "http://samsung.com/tv/metadata/app_support_continue_watching", value: "true" },
          ],
        },
      };
    });
    await page.goto(url);
    const card = page.locator("#continue-items > [data-key]");
    await expect(card).toHaveText(/Before return/);
    await page.evaluate(() => {
      window.savedAppSnapshot = AeroTizen.apps.getSnapshot();
      window.savedFeedCard = document.querySelector("#continue-items > [data-key]");
    });
    title = "After return";
    await page.evaluate(() => window.dispatchEvent(new Event("appcontrol")));
    await expect(card).toHaveText(/After return/);
    expect(reads).toBe(2);
    expect(await page.evaluate(() => window.appQueries)).toBe(2);
    expect(
      await page.evaluate(
        () =>
          AeroTizen.apps.getSnapshot() === window.savedAppSnapshot &&
          document.querySelector("#continue-items > [data-key]") === window.savedFeedCard,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
