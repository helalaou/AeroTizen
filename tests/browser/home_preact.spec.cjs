const { test, expect } = require("@playwright/test");
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    if (!localStorage.getItem("aerotizen.settings.v1"))
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0", "demo1", "demo2", "demo3"],
          background: "black",
          showWeather: false,
        }),
      );
  });
});
test("Home short/held OK, action menu, move/drop and Settings focus restoration", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  const first = page.locator("#grid > .tile").first();
  await expect(first).toHaveClass(/focused/);
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toContainText("Would open YouTube");
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(first).toHaveClass(/moving/);
  await expect(page.locator("#toast")).toHaveText("Use the arrows to move it, OK to drop");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => AeroTizen.settings.home[0])).toBe("demo0");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.home.slice(0, 2))).toEqual(["demo1", "demo0"]);
  await expect(page.locator("#toast")).toBeHidden();
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#grid > .tile").nth(1)).toHaveClass(/focused/);
  await page.reload();
  await expect(page.locator("#grid > .tile").first()).toHaveAttribute("data-id", "demo1");
  expect(errors).toEqual([]);
});
test("replacing the toast restarts its dismissal timer", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  const toast = page.locator("#toast");
  await expect(toast).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(toast).toBeVisible();
  await page.clock.runFor(1500);
  await page.keyboard.press("Enter");
  await page.clock.runFor(1500);
  await expect(toast).toBeVisible();
  await page.clock.runFor(1100);
  await expect(toast).toBeHidden();
});
test("Home and All apps retain keyed artwork nodes and Back returns to Home", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.evaluate(() => {
    window.originalHome = document.querySelector("#grid > .tile");
  });
  await page.locator("#apps-tab").click();
  await expect(page.locator("#grid > .tile")).toHaveCount(25);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#grid > .tile").first()).toHaveClass(/focused/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#grid > .tile")).toHaveCount(4);
  expect(await page.evaluate(() => window.originalHome === document.querySelector("#grid > .tile"))).toBe(true);
  await expect(page.locator("#home-tab")).toHaveClass(/focused/);
});
test("Back to top restores scroll and focus from below a partial app row", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "aerotizen.settings.v1";
    const settings = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...settings, homeCardColumns: 4 }));
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  const button = page.getByRole("button", { name: "Back to top" });
  await expect(button).toHaveCount(0);
  await page.locator("#apps-tab").click();

  for (let row = 0; row < 7; row++) {
    await page.keyboard.press("ArrowDown");
  }
  const tiles = page.locator("#grid > .tile");
  await expect(tiles.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(button).toBeFocused();
  await expect(button).toBeInViewport();
  await expect(page.locator(".content-viewport")).toHaveClass(/is-scrolled/);
  await expect
    .poll(() =>
      tiles.last().evaluate((tile) => {
        const viewport = tile.closest(".content-viewport");
        return tile.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      }),
    )
    .toBeCloseTo(16, 0);
  const viewportBounds = await page.locator(".content-viewport").boundingBox();
  const buttonBounds = await button.boundingBox();
  expect(viewportBounds.y + viewportBounds.height - buttonBounds.y - buttonBounds.height).toBeCloseTo(80, 0);
  const fill = await button.evaluate((node) => getComputedStyle(node).background);
  await page.keyboard.press("ArrowUp");
  await expect(tiles.last()).toBeFocused();
  await expect.poll(async () => (await button.boundingBox()).y).toBeCloseTo(buttonBounds.y, 0);
  await expect(button).toHaveCSS("background", fill);
  await page.keyboard.press("ArrowUp");
  await expect(button).not.toBeInViewport();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(tiles.first()).toBeFocused();
  await expect(page.locator(".content-viewport")).not.toHaveClass(/is-scrolled/);
  await expect(tiles.first()).toBeInViewport();
});
test("Home docks Inputs with one app row and leaves them in flow with two rows", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.evaluate(() => {
    AeroTizen.settings.home = ["demo0", "demo1", "demo2"];
    AeroTizen.settings.homeCardColumns = 3;
    AeroTizen.settings.save();
  });

  const inputs = page.locator("#inputs-section");
  const firstApp = page.locator("#grid > .tile").first();
  const firstInput = inputs.locator(".tile").first();
  await expect(inputs).toBeVisible();
  const bottomGap = await inputs.evaluate((section) => {
    const viewport = section.closest(".content-viewport");
    return viewport.getBoundingClientRect().bottom - section.getBoundingClientRect().bottom;
  });
  expect(bottomGap).toBeCloseTo(96, 0);
  await page.keyboard.press("ArrowDown");
  await expect(firstInput).toBeFocused();
  await expect(page.locator(".content-viewport")).not.toHaveClass(/is-scrolled/);
  await page.keyboard.press("ArrowUp");
  await expect(firstApp).toBeFocused();

  await page.evaluate(() => {
    AeroTizen.settings.home = [...AeroTizen.settings.home, "demo3"];
    AeroTizen.settings.save();
  });
  await expect(page.locator("#grid > .tile")).toHaveCount(4);
  const rowGap = await inputs.evaluate(
    (section) => section.getBoundingClientRect().top - document.getElementById("grid").getBoundingClientRect().bottom,
  );
  expect(rowGap).toBe(40);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#grid > .tile").last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(firstInput).toBeFocused();
});
test("compiled Home preserves legacy geometry and artwork source selection at 1080p", async ({
  page,
  browser,
}, info) => {
  const baseline = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await baseline.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await baseline.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  const seed = () =>
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        home: ["demo0", "demo1", "demo2", "demo3"],
        background: "black",
        showWeather: false,
      }),
    );
  await baseline.addInitScript(seed);
  await baseline.goto("http://127.0.0.1:8170/tests/fixtures/legacy-launcher/");
  await page.goto("/");
  for (const tab of [baseline, page])
    await tab.waitForFunction(() => AeroTizen.apps.ready && document.querySelector("#grid > .tile.focused"));
  const geometry = (tab) =>
    tab.evaluate(() =>
      [".topbar", "#gear", "#grid", "#inputs"].map((selector) => {
        const element = document.querySelector(selector),
          rect = element.getBoundingClientRect();
        // The shared Home heading and section spacing set a new vertical position for Inputs.
        const coordinates =
          selector === "#inputs" ? [rect.x, rect.width, rect.height] : [rect.x, rect.y, rect.width, rect.height];
        return [selector, ...coordinates.map((n) => Math.round(n))];
      }),
    );
  // Header tabs are now centred in both themes; app/source geometry remains upstream-compatible.
  await page.waitForFunction(() =>
    document
      .querySelector(".home-page-surface")
      .getAnimations()
      .every((a) => a.playState === "finished"),
  );
  expect(await geometry(page)).toEqual(await geometry(baseline));
  await baseline.screenshot({ path: info.outputPath("legacy-home.png") });
  await page.screenshot({ path: info.outputPath("preact-home.png") });
  await baseline.close();
});
