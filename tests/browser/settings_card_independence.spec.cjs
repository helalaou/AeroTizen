const { test, expect } = require("@playwright/test");
test("Home columns never change standard Settings icons or artwork nodes", async ({ page }) => {
  await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.locator("#gear").click();
  const category = async (id) => {
    const entry = page.locator(`[data-key="section:${id}"]`);
    if (await entry.count()) await entry.click();
  };
  await category("apps");
  const before = await page
    .locator("#all-apps > [data-settings-card]")
    .evaluateAll((nodes) => nodes.map((n) => [n.offsetWidth, n.offsetHeight]));
  for (const size of before) expect(size[0]).toBe(size[1]);
  await page.evaluate(() => {
    window.settingsIconNodes = Array.from(document.querySelectorAll("#all-apps > [data-settings-card]"));
  });
  await category("appearance");
  await expect(page.locator("#home-card-mode, #card-sizes")).toHaveCount(0);
  for (const columns of [3, 4, 5]) {
    await category("appearance");
    await page.locator(`[data-key="home-card-columns:${columns}"]`).click();
    await category("apps");
    expect(
      await page
        .locator("#all-apps > [data-settings-card]")
        .evaluateAll((nodes) => nodes.map((n) => [n.offsetWidth, n.offsetHeight])),
    ).toEqual(before);
    expect(
      await page.evaluate(() =>
        window.settingsIconNodes.every(
          (node, i) => node === document.querySelectorAll("#all-apps > [data-settings-card]")[i],
        ),
      ),
    ).toBe(true);
  }
});

for (const glassSettings of [false, true]) {
  test(`${glassSettings ? "Glass" : "Classic"} Settings cards retain styles without legacy Home sheets or the editor ID`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((glassSettings) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ glassSettings, home: ["demo0"], background: "black", showWeather: false }),
      );
    }, glassSettings);
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.ready);
    await page.locator("#gear").click();
    await page.locator('[data-key="section:apps"]').click();
    const cards = page.locator("#all-apps > [data-settings-card]");
    const inspect = () =>
      cards.evaluateAll((nodes) =>
        nodes.map((node) =>
          [node, ...node.querySelectorAll("div,svg,img")].map((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              bounds: [rect.x, rect.y, rect.width, rect.height],
              background: style.background,
              colour: style.color,
              font: style.font,
              gap: style.gap,
              padding: style.padding,
              opacity: style.opacity,
              shadow: style.boxShadow,
            };
          }),
        ),
      );
    const before = await inspect();
    expect(before.length).toBeGreaterThan(2);
    await page.evaluate(() => {
      document.querySelector('[data-settings-drawer="overlay"]').removeAttribute("id");
      for (const sheet of document.querySelectorAll('link[href="css/input-dock.css"]')) {
        sheet.disabled = true;
      }
    });
    expect(await inspect()).toEqual(before);
    const app = page.locator('#all-apps [data-key="app:demo0"]');
    await app.click();
    await expect(app).toHaveAttribute("data-focused", "true");
    await expect(app).toHaveAttribute("aria-pressed", "false");
  });
}
