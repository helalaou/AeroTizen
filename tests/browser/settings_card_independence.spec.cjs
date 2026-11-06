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
    .locator("#all-apps > .tile")
    .evaluateAll((nodes) => nodes.map((n) => [n.offsetWidth, n.offsetHeight]));
  for (const size of before) expect(size[0]).toBe(size[1]);
  await page.evaluate(() => {
    window.settingsIconNodes = Array.from(document.querySelectorAll("#all-apps > .tile"));
  });
  await category("appearance");
  await expect(page.locator("#home-card-mode, #card-sizes")).toHaveCount(0);
  for (const columns of [3, 4, 5]) {
    await category("appearance");
    await page.locator(`[data-key="home-card-columns:${columns}"]`).click();
    await category("apps");
    expect(
      await page.locator("#all-apps > .tile").evaluateAll((nodes) => nodes.map((n) => [n.offsetWidth, n.offsetHeight])),
    ).toEqual(before);
    expect(
      await page.evaluate(() =>
        window.settingsIconNodes.every((node, i) => node === document.querySelectorAll("#all-apps > .tile")[i]),
      ),
    ).toBe(true);
  }
});
