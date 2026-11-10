const { test, expect } = require("@playwright/test");

async function setup(page, version = "10.0", legacyWorks = true) {
  const requests = [];
  const errors = [];
  let releaseHandoff;
  let heldPath;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("**/test-wrt-service.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export class Service { constructor(id) { window.testWatcher.serviceId = id; } start() { window.testWatcher.starts++; window.testWatcher.up = true; return Promise.resolve(); } }",
    }),
  );
  await page.addInitScript(
    ({ version, legacyWorks }) => {
      window.testWatcher = { up: false, starts: 0, legacyStarts: 0, launches: [] };
      function mapModule() {
        const script = document.createElement("script");
        script.type = "importmap";
        script.textContent = JSON.stringify({ imports: { "wrt:service": "/test-wrt-service.js" } });
        document.documentElement.appendChild(script);
      }
      if (document.documentElement) mapModule();
      else document.addEventListener("DOMContentLoaded", mapModule);
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ home: ["youtube.app"], background: "black", showWeather: false }),
      );
      window.tizen = {
        systeminfo: { getCapability: () => version },
        ApplicationControl: function () {},
        application: {
          getAppsInfo(done) {
            done([
              { id: "youtube.app", name: "YouTube", packageId: "Youtube001" },
              { id: "regular.app", name: "Other app", packageId: "Regular001" },
            ]);
          },
          launchAppControl() {
            window.testWatcher.legacyStarts++;
            if (legacyWorks) window.testWatcher.up = true;
          },
          launch(id, done) {
            window.testWatcher.launches.push(id);
            if (done) done();
          },
        },
      };
    },
    { version, legacyWorks },
  );
  await page.route("http://127.0.0.1:47790/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path.startsWith("/diagnostics/")) {
      await route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" });
      return;
    }
    const up = await page.evaluate(() => window.testWatcher.up);
    if (!up) {
      await route.abort();
      return;
    }
    if (path === heldPath) {
      await new Promise((resolve) => {
        releaseHandoff = resolve;
      });
    }
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        homeControl: { protocol: 1, app_id: "DclHome001.Home", mode: "watcher" },
        heartbeats: 1,
        leaving: path === "/leave",
        watched: new URL(route.request().url()).searchParams.get("id"),
      }),
    });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.testWatcher.up && AeroTizen.apps.ready);
  await expect.poll(() => requests.filter((path) => path === "/apps").length).toBeGreaterThan(0);
  return {
    requests,
    errors,
    hold: (path) => {
      heldPath = path;
    },
    release: () => releaseHandoff(),
    waiting: () => Boolean(releaseHandoff),
  };
}

for (const version of ["9.0", "10.0"]) {
  test("normal startup selects the expected method on Tizen " + version, async ({ page }) => {
    const { requests, errors } = await setup(page, version);
    if (version === "9.0") {
      expect(await page.evaluate(() => window.testWatcher.legacyStarts)).toBe(1);
      expect(await page.evaluate(() => window.testWatcher.starts)).toBe(0);
    } else {
      expect(await page.evaluate(() => window.testWatcher.serviceId)).toBe("DclHome001.Watcher");
      expect(await page.evaluate(() => window.testWatcher.legacyStarts)).toBe(0);
    }
    expect(requests).toContain("/");
    expect(requests.some((path) => path.startsWith("/diagnostics/native-home"))).toBe(false);
    await page.locator("#gear").click();
    await page.locator('[data-key="section:about"]').click();
    await expect(page.getByText("Native Home tests", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("Tizen 9 falls back to wrt only when AppControl leaves the service unavailable", async ({ page }) => {
  const { errors } = await setup(page, "9.0", false);
  expect(await page.evaluate(() => window.testWatcher.legacyStarts)).toBe(1);
  expect(await page.evaluate(() => window.testWatcher.starts)).toBe(1);
  expect(await page.evaluate(() => window.testWatcher.serviceId)).toBe("DclHome001.Watcher");
  expect(errors).toEqual([]);
});

for (const { version, path, legacyStarts, wrtStarts } of [
  { version: "9.0", path: "/leave", legacyStarts: 2, wrtStarts: 0 },
  { version: "10.0", path: "/watch", legacyStarts: 0, wrtStarts: 2 },
]) {
  test(
    "Tizen " + version + " YouTube waits for recovered service and " + path + " acknowledgement",
    async ({ page }) => {
      const h = await setup(page, version);
      h.hold(path);
      await page.evaluate(() => {
        window.testWatcher.up = false;
      });
      await page.locator('#grid > [data-id="youtube.app"]').click();
      await expect.poll(h.waiting).toBe(true);
      expect(await page.evaluate(() => window.testWatcher.starts)).toBe(wrtStarts);
      expect(await page.evaluate(() => window.testWatcher.legacyStarts)).toBe(legacyStarts);
      expect(await page.evaluate(() => window.testWatcher.launches)).toEqual([]);
      if (version === "10.0") expect(h.requests).not.toContain("/leave");
      h.release();
      await page.waitForFunction(() => window.testWatcher.launches.includes("youtube.app"));
      expect(await page.evaluate(() => window.testWatcher.launches)).toEqual(["youtube.app"]);
      expect(h.errors).toEqual([]);
    },
  );
}

test("a regular app recovers the watcher before the launcher can freeze", async ({ page }) => {
  const h = await setup(page);
  await page.evaluate(() => {
    window.testWatcher.up = false;
  });
  await page.evaluate(() => AeroTizen.apps.launch({ id: "regular.app", name: "Other app" }));
  await page.waitForFunction(() => window.testWatcher.launches.includes("regular.app"));
  expect(await page.evaluate(() => window.testWatcher.starts)).toBe(2);
  expect(await page.evaluate(() => window.testWatcher.launches)).toEqual(["regular.app"]);
  expect(h.requests).toContain("/watch");
  expect(h.errors).toEqual([]);
});
