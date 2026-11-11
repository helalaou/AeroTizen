const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const [name, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  test(`${name} preferences load, update through Settings, and retain an empty Home after reload`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript(() => {
      if (localStorage.getItem("aerotizen.settings.v1") !== null) return;
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          home: ["demo0"],
          homeCardColumns: 5,
          background: "black",
          showWeather: false,
          tempUnit: "F",
          timeFormat: "24",
          inputNames: { "HDMI 1": "Console" },
        }),
      );
    });
    await page.goto(url);
    await expect(page).toHaveTitle("AeroTizen");
    await expect(page.locator("#grid > [data-id]")).toHaveCount(1);
    await expect(page.locator("#grid")).toHaveAttribute("data-columns", "5");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")));
    expect(saved.home).toEqual(["demo0"]);
    expect(saved.inputNames).toEqual({ "HDMI 1": "Console" });
    expect(saved.tempUnit).toBe("F");
    expect(saved).not.toHaveProperty("homeInitialized");
    expect(saved).not.toHaveProperty("favorites");
    expect(saved).not.toHaveProperty("cardSize");

    await page.locator("#gear").click();
    await openCategory(page, "appearance");
    await page.locator('[data-key="home-card-columns:4"]').click();
    await closeSettings(page);
    await page.reload();
    await expect(page.locator("#grid")).toHaveAttribute("data-columns", "4");
    await page.locator("#gear").click();
    await openCategory(page, "apps");
    await page.locator('[data-key="app:demo0"]').click();
    await closeSettings(page);
    await page.reload();
    await expect(page.locator("#grid > [data-id]")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")).home)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
