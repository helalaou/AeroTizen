const { test, expect } = require("@playwright/test");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");

async function prepare(page, { glass = false, language = "en", layout = "grid" } = {}) {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.route("http://localhost:9013/**", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/json",
      body: JSON.stringify(
        Array.from({ length: 10 }, (_, index) => ({
          app_id: "3201910019365",
          content_id: "episode" + index,
          content_title: "Programme " + index,
          timestamp: 10000 - index,
          payload: "watch?id=" + index,
          duration: 300,
          playback: 150,
        })),
      ),
    }),
  );
  await page.addInitScript(
    ({ glass, language, layout }) => {
      const prime = "org.tizen.primevideo";
      const apps = Array.from({ length: 12 }, (_, index) => ({
        id: index ? "testpkg" + String(index).padStart(3, "0") + ".App" : prime,
        packageId: "testpkg" + String(index).padStart(3, "0"),
        name: index ? "App " + index : "Prime Video",
      }));
      if (!localStorage.getItem("aerotizen.settings.v1")) {
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            home: apps.map((app) => app.id),
            glassSettings: glass,
            language,
            homeAppLayout: layout,
            showWeather: false,
            continueWatching: true,
            continueWatchingApps: [prime],
            background: "black",
          }),
        );
      }
      window.scrollLaunches = [];
      window.tizen = {
        application: {
          launch(id, done) {
            window.scrollLaunches.push(id);
            done?.();
          },
          getAppsInfo: (done) => done(apps),
          getAppMetaData: (id) =>
            id === prime
              ? [{ key: "http://samsung.com/tv/metadata/app_support_continue_watching", value: "true" }]
              : [],
        },
      };
    },
    { glass, language, layout },
  );
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(10);
}

const offset = (page, id) => page.locator(id).getAttribute("data-offset").then(Number);
const fullyVisible = async (page, card) => {
  await expect
    .poll(async () => {
      const rect = await card.boundingBox();
      const viewport = await page.locator("[data-home-viewport]").boundingBox();
      return rect && rect.x >= 9 && rect.x + rect.width <= 1911 && rect.y >= viewport.y && rect.y + rect.height <= 991;
    })
    .toBe(true);
};

for (const glass of [false, true]) {
  for (const language of ["en", "ar"]) {
    test(`${glass ? "Glass" : "Classic"} ${language} Home scroll shares movement with the feed and retains separate offsets`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await prepare(page, { glass, language });
      const track = await page.locator("#grid").elementHandle();
      await page.locator("#gear").click();
      await openCategory(page, "appearance");
      await expect(page.locator("#home-card-columns .choice-option__description")).toHaveCount(0);
      await page.locator('[data-key="home-app-layout:scroll"]').click();
      await closeSettings(page);
      await expect(page.locator("#grid")).toHaveAttribute("data-scroll", "true");
      expect(await track.evaluate((node) => node === document.querySelector("#grid"))).toBe(true);
      const apps = page.locator("#grid > [data-id]");
      expect(await apps.evaluateAll((nodes) => new Set(nodes.map((node) => node.offsetTop)).size)).toBe(1);
      await page.locator("#home-tab").click();
      await page.keyboard.press("ArrowDown");
      await expect(apps.first()).toBeFocused();
      const next = language === "ar" ? "ArrowLeft" : "ArrowRight";
      for (let index = 0; index < 8; index++) await page.keyboard.press(next);
      await expect(apps.nth(8)).toBeFocused();
      await fullyVisible(page, apps.nth(8));
      const appOffset = await offset(page, "#grid");
      expect(appOffset).toBeGreaterThan(0);
      expect(await offset(page, "#continue-items")).toBe(0);
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("#continue-items > [data-key][data-focused=true]")).toHaveCount(1);
      for (let index = 0; index < 8; index++) await page.keyboard.press(next);
      await expect(page.locator("#continue-items > [data-key]").last()).toBeFocused();
      await fullyVisible(page, page.locator("#continue-items > [data-key]").last());
      expect(await offset(page, "#continue-items")).toBeGreaterThan(0);
      const feedOffset = await offset(page, "#continue-items");
      await page.keyboard.press("ArrowUp");
      await expect(page.locator("#grid > [data-id][data-focused=true]")).toHaveCount(1);
      await fullyVisible(page, page.locator("#grid > [data-id][data-focused=true]"));
      expect(await offset(page, "#continue-items")).toBe(feedOffset);
      expect(await offset(page, "#grid")).toBe(appOffset);
      await page.reload();
      await expect(page.locator("#grid")).toHaveAttribute("data-scroll", "true");
      await page.locator("#apps-tab").click();
      await expect(page.locator("#grid")).not.toHaveAttribute("data-scroll", "true");
      await page.locator("#home-tab").click();
      await page.keyboard.press("ArrowDown");
      for (let index = 0; index < 11; index++) await page.keyboard.press(next);
      await expect(apps.last()).toBeFocused();
      await page.evaluate(() => {
        AeroTizen.settings.update({ home: AeroTizen.settings.getSnapshot().home.slice(0, 3) });
      });
      await expect(apps).toHaveCount(3);
      await expect.poll(() => offset(page, "#grid")).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test(`${glass ? "Glass" : "Classic"} all scroll sizes reveal another app and work below every clock style`, async ({
    page,
  }, info) => {
    await prepare(page, { glass, layout: "scroll" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const clock of ["classic", "vertical", "horizontal", "minimal", "bold"]) {
      for (const columns of [5, 4, 3]) {
        await page.evaluate(
          ({ clock, columns }) => {
            AeroTizen.settings.update({
              homeCardColumns: columns,
              clockLayout: clock === "classic" ? "classic" : "custom",
              aeroClockStyle: clock === "classic" ? "vertical" : clock,
            });
          },
          { clock, columns },
        );
        await page.locator("#home-tab").click();
        await page.keyboard.press("ArrowDown");
        await fullyVisible(page, page.locator("#grid > [data-id]").first());
        await expect
          .poll(() =>
            page.locator("#grid > [data-id]").evaluateAll((nodes) =>
              nodes.some((node) => {
                const rect = node.getBoundingClientRect();
                return rect.left < 1896 && rect.right > 1920 && rect.left > 0;
              }),
            ),
          )
          .toBe(true);
        const feed = await page.locator("#continue-section").boundingBox();
        expect(feed.y).toBeLessThan(950);
        if (clock === "classic") expect(feed.y + feed.height).toBeLessThanOrEqual(1000);
        await page.keyboard.press("ArrowDown");
        await fullyVisible(page, page.locator("#continue-items > [data-key][data-focused=true]"));
        if (clock === "classic" && columns === 3) await page.screenshot({ path: info.outputPath("apps-and-feed.png") });
      }
    }
    await expect(page.locator("#grid")).toHaveCSS("transition-duration", "0s");
    await expect(page.locator("#continue-items")).toHaveCSS("transition-duration", "0s");
  });
}

for (const language of ["en", "ar"]) {
  test(`${language} scrolling app rows retain launch and long-press move actions`, async ({ page }) => {
    await prepare(page, { layout: "scroll", language });
    const next = language === "ar" ? "ArrowLeft" : "ArrowRight";
    const before = await page.evaluate(() => AeroTizen.settings.getSnapshot().home.slice());
    await page.locator("#home-tab").click();
    await page.keyboard.press("ArrowDown");
    for (let index = 0; index < 6; index++) await page.keyboard.press(next);
    const card = page.locator('#grid > [data-id][data-id="' + before[6] + '"]');
    await expect(card).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.scrollLaunches)).toEqual([before[6]]);
    await page.keyboard.down("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.up("Enter");
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("data-moving", "true");
    await expect(card.locator("[data-reorder-arrow].up, [data-reorder-arrow].down")).toHaveCount(0);
    await page.keyboard.press(next);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home[7])).toBe(before[6]);
    await fullyVisible(page, card);
  });
}
