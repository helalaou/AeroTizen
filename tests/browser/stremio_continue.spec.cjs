const { openCategory, closeSettings } = require("./drawer_helpers.cjs");
const { test, expect } = require("./launcher_fixture.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");
const stremio = "IkWsFHtOY9.Stremio",
  prime = "org.tizen.primevideo",
  youtube = "9Ur5IzDKqV.TizenYouTube",
  secret = "b".repeat(64);
async function createSetup(page, options = {}) {
  const state = { root: true, credential: true, contentId: "show1", playback: 120, ...options };
  const calls = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.route("http://localhost:9013/**", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          app_id: "3201910019365",
          content_id: "prime1",
          content_title: "Prime programme",
          payload: "prime",
          timestamp: 1000,
        },
      ]),
    }),
  );
  await page.route("http://127.0.0.1:47791/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push({
      path,
      token: route.request().headers()["x-aerotizen-token"],
    });
    if (path === "/v1/credential") {
      const available = state.root;
      if (available) {
        await page.evaluate(() => {
          window.stremioCredentialReady = true;
        });
      }
      return route.fulfill({ headers: { "access-control-allow-origin": "*" }, status: available ? 204 : 503 });
    }
    const body =
      path === "/v1/capabilities"
        ? {
            schema_version: 1,
            root: state.root,
            stremio_installed: true,
            stremio_readable: state.root,
            stremio_app_id: stremio,
          }
        : {
            schema_version: 1,
            records: [
              {
                app_id: "3202306031311",
                content_id: state.contentId,
                content_title: "Stremio programme",
                payload: JSON.stringify({
                  provider: "stremio",
                  type: "series",
                  id: state.contentId,
                  videoId: state.contentId + ":2:9",
                  kind: "resume",
                }),
                season: 2,
                episode: 9,
                duration: 300,
                playback: state.playback,
                timestamp: 2000,
              },
            ],
          };
    return route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.addInitScript(
    ({ state, stremio, prime, youtube, secret }) => {
      const apps = [{ id: prime, name: "Prime Video", packageId: prime }];
      apps.push({ id: stremio, name: "Stremio", packageId: "IkWsFHtOY9" });
      if (state.youtube) apps.push({ id: youtube, name: "YouTube", packageId: youtube });
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: [prime],
          showWeather: false,
          background: "black",
          continueWatching: false,
          continueWatchingApps: [],
        }),
      );
      window.privateReads = [];
      window.stremioLaunches = [];
      window.stremioCredentialReady = state.credential;
      window.tizen = {
        application: {
          getAppsInfo: (done) => done(apps),
          // Even a future Stremio declaration must not bypass the root gate.
          getAppMetaData: () => [
            { key: "http://samsung.com/tv/metadata/app_support_continue_watching", value: "true" },
          ],
          launch: (id) => window.stremioLaunches.push(id),
        },
        filesystem: {
          resolve(path, done, failed, mode) {
            window.privateReads.push({ path, mode });
            if (!window.stremioCredentialReady || path !== "wgt-private/stremio-feed.json") {
              failed();
              return;
            }
            const content = JSON.stringify({ schema_version: 1, token: secret });
            done({
              fileSize: content.length,
              openStream(mode, opened) {
                opened({ read: () => content, close() {} });
              },
            });
          },
        },
      };
    },
    { state, stremio, prime, youtube, secret },
  );
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.locator("#gear").click();
  await openCategory(page, "apps");
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => window.privateReads.length)).toBe(0);
  await page.locator('[data-key="continue-watching"]').click();
  return { state, calls, errors };
}
test("root helper and installed Stremio enable an opt-in source; loss hides it but keeps the choice", async ({
  page,
}) => {
  const h = await createSetup(page);
  const option = page.locator('[data-key="continue-app:' + stremio + '"]');
  await expect(option).toBeVisible();
  expect(h.calls.every((call) => call.token === secret)).toBe(true);
  expect(await page.evaluate(() => "continueWatchingProviders" in AeroTizen)).toBe(false);
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        feed: AeroTizen.continueWatching.getSnapshot(),
        saved: localStorage.getItem("aerotizen.settings.v1"),
      }).includes("b".repeat(64)),
    ),
  ).toBe(false);
  expect(h.calls.filter((call) => call.path.endsWith("/items"))).toHaveLength(0);
  await page.locator('[data-key="continue-app:' + prime + '"]').click();
  await option.click();
  await closeSettings(page);
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(2);
  await expect(page.locator("#continue-items > [data-key]").first()).toContainText("Stremio programme");
  await expect(page.locator("#continue-items > [data-key]").first()).toContainText("S2 E9");
  await page.locator("#continue-items > [data-key]").first().click();
  await expect.poll(() => page.evaluate(() => window.stremioLaunches)).toEqual([stremio]);
  await page.evaluate(() => {
    window.savedStremio = document.querySelector("#continue-items > [data-key]");
    AeroTizen.continueWatching.refresh();
  });
  await expect
    .poll(() =>
      page.evaluate((id) => AeroTizen.continueWatching.getSnapshot().sources.find((s) => s.id === id)?.status, stremio),
    )
    .toBe("Available");
  expect(
    await page.evaluate(() => window.savedStremio === document.querySelector("#continue-items > [data-key]")),
  ).toBe(true);
  await page.clock.install();
  const settled = h.calls.length;
  await page.clock.fastForward(35000);
  expect(h.calls.length).toBe(settled);
  h.state.root = false;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("#gear").click();
  await openCategory(page, "apps");
  await expect(option).toHaveCount(0);
  expect(await page.evaluate((id) => AeroTizen.settings.getSnapshot().continueWatchingApps.includes(id), stremio)).toBe(
    true,
  );
  await closeSettings(page);
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(1);
  await expect(page.locator("#continue-items > [data-key]")).toContainText("Prime programme");
  h.state.root = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("#gear").click();
  await openCategory(page, "apps");
  await expect(option).toBeVisible();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await closeSettings(page);
  await expect(page.locator("#continue-items > [data-key]")).toHaveCount(2);
  expect(h.errors).toEqual([]);
});
