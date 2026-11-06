const { test, expect } = require("@playwright/test");

for (const scenario of [
  { size: "small", count: 5, columns: 5, initial: 3, scrolled: 6 },
  { size: "big", count: 3, columns: 3, initial: 3, scrolled: 6 },
  { size: "small", count: 7, columns: 5, initial: 1, scrolled: 6 },
  // An incomplete app row starts in its grid column, so its nearest feed card is left of centre.
  { size: "big", count: 4, columns: 3, initial: 1, scrolled: 6 },
]) {
  test(`Continue Watching keeps its position across ${scenario.count} ${scenario.size} Home apps`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://localhost:9013/**", (route) =>
      route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify(
          Array.from({ length: 10 }, (_, i) => ({
            app_id: "3201910019365",
            content_id: "episode" + i,
            content_title: "Programme " + i,
            timestamp: 10000 - i,
            payload: "watch?id=" + i,
            season: 1,
            episode: i + 1,
            duration: 300,
            playback: 150,
          })),
        ),
      }),
    );
    await page.addInitScript(({ size, count }) => {
      const prime = "org.tizen.primevideo";
      const apps = Array.from({ length: count }, (_, i) => ({
        id: i ? "testpkg00" + i + ".App" : prime,
        packageId: "testpkg00" + i,
        name: i ? "App " + i : "Prime Video",
      }));
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: apps.map((app) => app.id),
          cardSize: size,
          background: "black",
          showWeather: false,
          continueWatching: true,
          continueWatchingApps: [prime],
        }),
      );
      window.tizen = {
        application: {
          getAppsInfo: (done) => done(apps),
          getAppMetaData: (id) =>
            id === prime
              ? [
                  {
                    key: "http://samsung.com/tv/metadata/app_support_continue_watching",
                    value: "true",
                  },
                ]
              : [],
        },
      };
    }, scenario);
    await page.addInitScript(() => {
      const getById = document.getElementById.bind(document);
      document.getElementById = (id) => {
        if (id === "continue-items") throw new Error("Continue Watching must use its registered refs");
        return getById(id);
      };
    });
    await page.goto("/");
    await expect(page).toHaveTitle("AeroTizen");
    const cards = page.locator("#continue-items > [data-key]"),
      apps = page.locator("#grid > [data-id]");
    await expect(cards).toHaveCount(10);
    await expect(apps).toHaveCount(scenario.count);
    await expect
      .poll(() =>
        page.locator("#continue-section [data-horizontal-scroller]").evaluate((viewport) => {
          const { left, right } = viewport.getBoundingClientRect();
          return [left, right];
        }),
      )
      .toEqual([0, 1920]);
    const lastRow = Math.floor((scenario.count - 1) / scenario.columns),
      start = lastRow * scenario.columns;
    for (let i = 0; i < lastRow; i++) await page.keyboard.press("ArrowDown");
    await expect(apps.nth(start)).toHaveAttribute("data-focused", "true");
    const position = () => page.locator("#continue-items").evaluate((n) => n.style.transform);
    const initialPosition = await position();
    for (let i = start + 1; i < scenario.count; i++) {
      await page.keyboard.press("ArrowRight");
      expect(await position()).toBe(initialPosition);
    }
    await page.keyboard.press("ArrowDown");
    await expect(cards.nth(scenario.initial)).toHaveAttribute("data-focused", "true");
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    await expect(cards.last()).toHaveAttribute("data-focused", "true");
    await expect
      .poll(async () => {
        const rect = await cards.last().boundingBox();
        return rect.x + rect.width;
      })
      .toBeLessThanOrEqual(1872);
    const scrolledPosition = await position();
    await page.keyboard.press("ArrowUp");
    await expect(apps.last()).toHaveAttribute("data-focused", "true");
    for (let i = scenario.count - 1; i > start; i--) {
      await page.keyboard.press("ArrowLeft");
      expect(await position()).toBe(scrolledPosition);
    }
    await expect(apps.nth(start)).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowDown");
    await expect(cards.nth(scenario.scrolled)).toHaveAttribute("data-focused", "true");
    expect(await position()).toBe(scrolledPosition);
    await page.screenshot({ path: info.outputPath("nearest-continue-card.png") });
    await page.keyboard.press("ArrowUp");
    await expect(apps.nth(start)).toHaveAttribute("data-focused", "true");
    expect(await position()).toBe(scrolledPosition);
    expect(errors).toEqual([]);
  });
}

for (const settingsOpen of [false, true]) {
  test(`a shorter Continue Watching list stays visible while focus is ${settingsOpen ? "in Settings" : "on the app grid"}`, async ({
    page,
  }, info) => {
    let count = 10;
    const errors = [],
      prime = "org.tizen.primevideo";
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://localhost:9013/**", (route) =>
      route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify(
          Array.from({ length: count }, (_, i) => ({
            app_id: "3201910019365",
            content_id: "episode" + i,
            content_title: "Programme " + i,
            timestamp: 10000 - i,
            payload: "watch?id=" + i,
          })),
        ),
      }),
    );
    await page.addInitScript((prime) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: [prime],
          background: "black",
          showWeather: false,
          continueWatching: true,
          continueWatchingApps: [prime],
        }),
      );
      window.tizen = {
        application: {
          getAppsInfo: (done) => done([{ id: prime, packageId: prime, name: "Prime Video" }]),
          getAppMetaData: () => [
            { key: "http://samsung.com/tv/metadata/app_support_continue_watching", value: "true" },
          ],
        },
      };
    }, prime);
    await page.goto("/");
    const cards = page.locator("#continue-items > [data-key]"),
      app = page.locator("#grid > [data-id]");
    await expect(cards).toHaveCount(10);
    await page.keyboard.press("ArrowDown");
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    await expect(cards.last()).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowUp");
    await expect(app).toHaveAttribute("data-focused", "true");
    if (settingsOpen) await page.locator("#gear").click();
    count = 2;
    await page.evaluate(() => AeroTizen.continueWatching.refresh());
    await expect(cards).toHaveCount(2);
    await expect
      .poll(
        () =>
          cards.evaluateAll((nodes) => {
            const clip = document.querySelector("#continue-section [data-horizontal-scroller]").getBoundingClientRect();
            return nodes.every((node) => {
              const rect = node.getBoundingClientRect();
              return rect.left >= clip.left && rect.right <= clip.right;
            });
          }),
        { timeout: 3000 },
      )
      .toBe(true);
    if (settingsOpen) await page.keyboard.press("Escape");
    await expect(app).toHaveAttribute("data-focused", "true");
    await page.screenshot({ path: info.outputPath("shorter-continue-list.png") });
    expect(errors).toEqual([]);
  });
}
