const { test, expect } = require("@playwright/test");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const glass of [false, true])
  for (const columns of [3, 4, 5]) {
    test(`${glass ? "Glass" : "Classic"} square ${columns} columns retain artwork, remote navigation and persistence`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
      await page.addInitScript((glassSettings) => {
        if (!localStorage.getItem("aerotizen.settings.v1")) {
          localStorage.setItem("aerotizen.settings.v1", JSON.stringify({ glassSettings }));
        }
      }, glass);
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await page.locator("#gear").click();
      await openCategory(page, "appearance");
      await expect(page.locator("#home-card-mode, #card-sizes")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "App size", exact: true })).toBeVisible();
      await expect(page.locator("#home-card-columns").getByRole("button")).toHaveText(["Small", "Medium", "Large"]);
      const choice = page.locator(`[data-key="home-card-columns:${columns}"]`);
      await choice.focus();
      await page.keyboard.press("Enter");
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      await closeSettings(page);
      await page.locator("#apps-tab").click();
      await expect(page.locator("#grid")).toHaveAttribute("data-columns", String(columns));
      const tiles = page.locator("#grid > [data-id]");
      const positions = await tiles.evaluateAll((nodes) =>
        nodes.slice(0, 6).map((n) => ({ top: n.offsetTop, width: n.offsetWidth, height: n.offsetHeight })),
      );
      expect(positions.filter((p) => p.top === positions[0].top)).toHaveLength(columns);
      for (const position of positions) expect(position.width).toBe(position.height);
      await page.keyboard.press("ArrowDown");
      await expect(tiles.first()).toHaveAttribute("data-focused", "true");
      await page.keyboard.press("ArrowDown");
      await expect(tiles.nth(columns)).toHaveAttribute("data-focused", "true");
      // Long OK opens the app menu; moving uses the same square geometry.
      await page.locator("#home-tab").click();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.down("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.up("Enter");
      await page.keyboard.press("Enter");
      await expect(page.locator("#grid > [data-id]").first()).toHaveAttribute("data-moving", "true");
      const viewportTop = await page
        .locator("[data-home-viewport]")
        .evaluate((node) => node.getBoundingClientRect().top);
      await expect
        .poll(async () => (await page.locator("#grid > [data-id]").first().boundingBox()).y)
        .toBeGreaterThanOrEqual(viewportTop + 9);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await page.reload();
      expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().homeCardColumns)).toBe(columns);
      await expect(page.locator("#grid")).toHaveAttribute("data-columns", String(columns));
      await page.locator("#gear").click();
      await openCategory(page, "appearance");
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(() =>
          performance.getEntriesByType("resource").some((r) => r.name.includes("/assets/brands/")),
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    });
  }

test("a saved rectangle layout opens as squares and retains its row count", async ({ page }) => {
  await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
  await page.addInitScript(() => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({ homeCardMode: "rectangle", homeCardColumns: null, cardSize: "small" }),
    );
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await expect(page.locator("#grid")).toHaveAttribute("data-columns", "5");
  const size = await page
    .locator("#grid > [data-id]")
    .first()
    .evaluate((n) => [n.offsetWidth, n.offsetHeight]);
  expect(size).toEqual([332, 332]);
  await page.locator("#gear").click();
  await openCategory(page, "appearance");
  await expect(page.locator('[data-key="home-card-columns:5"]')).toHaveAttribute("aria-pressed", "true");
});

for (const glass of [false, true]) {
  test(`${glass ? "Glass" : "Classic"} app sizes fit two complete rows and keep focused rows inside the viewport`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.clock.setFixedTime(new Date("2026-11-06T10:20:00Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((glassSettings) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ glassSettings, showWeather: true, background: "black" }),
      );
      localStorage.setItem(
        "aerotizen.weather.v2",
        JSON.stringify({
          temp: 20,
          code: 3,
          day: 1,
          at: Date.parse("2026-11-06T10:20:00Z"),
          unit: "C",
          source: "auto",
          city: "A very long fixture city name",
        }),
      );
    }, glass);
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    for (const clock of ["classic", "vertical", "horizontal", "minimal", "bold"]) {
      const sizes = [];
      for (const columns of [5, 4, 3]) {
        await page.evaluate(
          ({ columns, clock }) => {
            AeroTizen.settings.update({
              homeCardColumns: columns,
              home: Array.from({ length: columns * 2 }, (_, index) => "demo" + index),
              clockLayout: clock === "classic" ? "classic" : "custom",
              aeroClockStyle: clock === "classic" ? "vertical" : clock,
            });
          },
          { columns, clock },
        );
        await page.locator("#home-tab").click();
        const apps = page.locator("#grid > [data-id]");
        await expect(apps).toHaveCount(columns * 2);
        const geometry = await apps.evaluateAll((nodes) =>
          nodes.map((node) => ({
            top: node.offsetTop,
            left: node.getBoundingClientRect().left,
            right: node.getBoundingClientRect().right,
            bottom: node.getBoundingClientRect().bottom,
            width: node.offsetWidth,
            height: node.offsetHeight,
          })),
        );
        expect(new Set(geometry.map((rect) => rect.top)).size).toBe(2);
        expect(geometry.filter((rect) => rect.top === geometry[0].top)).toHaveLength(columns);
        const bottom = await page
          .locator("[data-home-viewport]")
          .evaluate((node) => node.getBoundingClientRect().bottom - 80);
        for (const rect of geometry) {
          expect(rect.width).toBe(rect.height);
          expect(rect.left).toBeGreaterThanOrEqual(24);
          expect(rect.right).toBeLessThanOrEqual(1896);
          expect(rect.bottom).toBeLessThanOrEqual(bottom - 18);
        }
        sizes.push(geometry[0].width);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect(apps.nth(columns)).toBeFocused();
        await expect
          .poll(async () => (await apps.nth(columns).boundingBox()).y + (await apps.nth(columns).boundingBox()).height)
          .toBeLessThanOrEqual(bottom - 9);
        await expect(page.locator("[data-home-viewport]")).toHaveAttribute("data-scrolled", "false");
        if (clock === "classic" || clock === "vertical") {
          await page.screenshot({ path: info.outputPath(`${clock}-${columns}-two-rows.png`) });
        }
        // More than two rows remain reachable; the full focused card must clear both fades.
        await page.evaluate((columns) => {
          AeroTizen.settings.update({ home: Array.from({ length: columns * 3 }, (_, index) => "demo" + index) });
        }, columns);
        await page.keyboard.press("ArrowDown");
        await expect(apps.nth(columns * 2)).toBeFocused();
        const top = await page.locator("[data-home-viewport]").evaluate((node) => node.getBoundingClientRect().top);
        await expect
          .poll(async () => {
            const rect = await apps.nth(columns * 2).boundingBox();
            return rect.y >= top + 112 && rect.y + rect.height <= bottom - 9;
          })
          .toBe(true);
      }
      expect(sizes[0]).toBeLessThan(sizes[1]);
      expect(sizes[1]).toBeLessThan(sizes[2]);
    }
    expect(errors).toEqual([]);
  });
}
