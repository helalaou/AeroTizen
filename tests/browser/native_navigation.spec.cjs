const { test, expect } = require("./launcher_fixture.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");

async function setup(page, url) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
  await page.route("http://127.0.0.1:47790/**", (route) =>
    route.fulfill({ json: watcherStatus(route.request().url()) }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        home: ["test.app"],
        background: "black",
        showWeather: false,
        continueWatching: false,
      }),
    );
    const qa = (window.navigationQA = { reads: 0, native: true, launches: [], requests: [], visibility: new Set() });
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
      if (type === "visibilitychange") qa.visibility.add(listener);
      add(type, listener, options);
    };
    document.removeEventListener = (type, listener, options) => {
      if (type === "visibilitychange") qa.visibility.delete(listener);
      remove(type, listener, options);
    };
    window.tizen = {
      ApplicationControl: function () {},
      application: {
        getAppsInfo: (done) => done([{ id: "test.app", name: "Test", packageId: "TestPkg001" }]),
        getAppMetaData: () => [],
        launch: (id, ready) => {
          qa.launches.push(id);
          ready?.();
        },
        launchAppControl() {},
      },
      filesystem: {
        resolve: (_path, done) => {
          qa.reads++;
          const text = JSON.stringify({
            mode: qa.native ? "native" : "watcher",
            transaction: "a".repeat(32),
            baseline_sha256: "b".repeat(64),
          });
          done({ fileSize: text.length, readAsText: (read) => read(text) });
        },
      },
    };
  });
  await page.goto(url);
  await expect(page.locator('#grid > [data-id="test.app"]')).toBeVisible();
  await page.evaluate(() => {
    AeroTizen.homewatch.request = (path, ready) => {
      window.navigationQA.requests.push(path);
      window.navigationQA.ack = ready;
    };
  });
  return errors;
}

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} native navigation reads routing per handoff and waits for watcher acknowledgement`, async ({
    page,
  }) => {
    const errors = await setup(page, url);
    await page.evaluate(() => AeroTizen.homewatch.openSamsungHome());
    expect(await page.evaluate(() => window.navigationQA.launches)).toEqual(["com.samsung.tv.csfs"]);
    expect(await page.evaluate(() => window.navigationQA.requests)).toEqual([]);
    await page.evaluate(() => {
      window.navigationQA.native = false;
      AeroTizen.homewatch.openSamsungHome();
      AeroTizen.homewatch.openSamsungHome();
    });
    expect(await page.evaluate(() => window.navigationQA.reads)).toBe(2);
    expect(await page.evaluate(() => window.navigationQA.launches.length)).toBe(1);
    expect(await page.evaluate(() => window.navigationQA.requests)).toEqual(["/leave"]);
    await page.evaluate(() => window.navigationQA.ack({ leaving: true }));
    expect(await page.evaluate(() => window.navigationQA.launches)).toEqual([
      "com.samsung.tv.csfs",
      "com.samsung.tv.csfs",
    ]);
    await expect(page.locator('script[src$="/native-navigation.js"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`${name} native viewer handles quick returns and releases focus checks on disposal`, async ({ page }) => {
    const errors = await setup(page, url);
    await page.clock.install();
    await page.evaluate(() => {
      const qa = window.navigationQA;
      const before = new Set(qa.visibility);
      AeroTizen.homewatch.openNativeViewer();
      qa.viewerListener = [...qa.visibility].find((listener) => !before.has(listener));
    });
    expect(await page.evaluate(() => typeof window.navigationQA.viewerListener)).toBe("function");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.fastForward(2200);
    expect(await page.evaluate(() => window.navigationQA.visibility.has(window.navigationQA.viewerListener))).toBe(
      false,
    );
    expect(await page.evaluate(() => window.navigationQA.requests)).not.toContain("/home");
    await page.evaluate(() => {
      const qa = window.navigationQA;
      const before = new Set(qa.visibility);
      AeroTizen.homewatch.openNativeViewer();
      qa.viewerListener = [...qa.visibility].find((listener) => !before.has(listener));
    });
    expect(await page.evaluate(() => typeof window.navigationQA.viewerListener)).toBe("function");
    await page.evaluate(() => AeroTizen.nativeNavigation.dispose());
    await page.clock.fastForward(2200);
    expect(await page.evaluate(() => window.navigationQA.visibility.has(window.navigationQA.viewerListener))).toBe(
      false,
    );
    expect(await page.evaluate(() => window.navigationQA.requests)).not.toContain("/home");
    expect(await page.evaluate(() => AeroTizen.homewatch.openNativeViewer())).toBe(false);
    expect(errors).toEqual([]);
  });
}
