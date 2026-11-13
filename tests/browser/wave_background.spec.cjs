const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

test.beforeEach(async ({ context }) => {
  await context.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await context.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
});

const open = async (page, background = "waves") => {
  await page.addInitScript((background) => {
    if (!localStorage.getItem("aerotizen.settings.v1")) {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ background, speed: 1, showWeather: false, weatherPhoto: false }),
      );
    }
  }, background);
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready && AeroTizen.homeScreen);
};

const durations = (page) =>
  page
    .locator("#bg [data-background-wave]")
    .evaluateAll((nodes) => nodes.map((node) => parseFloat(node.style.animationDuration)));

test("wave selection, speed and scene switching persist without retaining old animation nodes", async ({ page }) => {
  await open(page, "black");
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await page.locator('[data-key="wallpaper-categories:animated"]').click();
  await page.locator('[data-key="bg:waves"]').click();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);
  await expect(page.locator('#bg svg[aria-hidden="true"][focusable="false"]')).toHaveCount(2);
  expect(await durations(page)).toEqual([28, 18]);
  const oldWave = await page.locator("#bg [data-background-wave]").first().elementHandle();
  const speed = page.getByRole("slider", { name: "Background speed" });
  await speed.focus();
  await page.keyboard.press("ArrowRight");
  await expect(speed).toHaveAttribute("aria-valuenow", "1.25");
  const changed = await durations(page);
  expect(changed[0]).toBeCloseTo(28 / 1.25, 4);
  expect(changed[1]).toBeCloseTo(18 / 1.25, 4);
  expect(await oldWave.evaluate((node) => node.isConnected)).toBe(false);
  await page.locator('[data-key="bg:aurora"]').click();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(0);
  await expect(page.locator("#bg [data-background-blob]")).toHaveCount(4);
  await page.locator('[data-key="bg:waves"]').click();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);
  await closeSettings(page);
  await page.reload();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);
  expect(await durations(page)).toEqual(changed);
  await page.evaluate(() => window.Backgrounds.suspend());
  await expect(page.locator("#bg")).toBeHidden();
  await page.evaluate(() => AeroTizen.applyBackground());
  await expect(page.locator("#bg")).toBeVisible();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);
});

test("weather photos unmount waves and restore them at the selected speed", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T12:00:00Z"));
  await open(page);
  await page.evaluate(() => {
    AeroTizen.weather.currentReading = () => ({
      code: 0,
      day: 1,
      at: Date.now(),
      solar: [{ sunrise: Date.parse("2026-11-02T06:00Z"), sunset: Date.parse("2026-11-02T18:00Z") }],
    });
  });
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await page.locator('[data-key="wallpaper-categories:photo"]').click();
  const control = page.getByRole("group", { name: "Dynamic weather wallpapers" });
  await control.getByRole("button", { name: "Automatic (weather)", exact: true }).click();
  await expect(page.locator("#weather-photo")).toBeVisible();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(0);
  await expect(page.locator("#bg")).toBeHidden();
  await page.evaluate(() => window.Backgrounds.setSpeed(2));
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(0);

  await page.route("**/assets/weather/rain.jpg", (route) => route.abort());
  await page.evaluate(() => {
    const sun = AeroTizen.weather.currentReading();
    AeroTizen.weather.currentReading = () => ({ ...sun, code: 61 });
    AeroTizen.applyBackground();
  });
  await expect(page.locator("#weather-photo")).toBeHidden();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);

  await control.getByRole("button", { name: "Off", exact: true }).click();
  await expect(page.locator("#weather-photo")).toBeHidden();
  await expect(page.locator("#bg")).toBeVisible();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);
  expect(await durations(page)).toEqual([28, 18]);
});

async function disableWebGL(page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl") {
        throw new Error("WebGL unavailable");
      }
      return getContext.call(this, type, ...args);
    };
  });
}

test("wallpaper settings hide only WebGL scenes when the context probe fails", async ({ page }) => {
  await disableWebGL(page);
  await open(page, "black");
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await page.locator('[data-key="wallpaper-categories:animated"]').click();
  for (const scene of ["starfield", "nebula", "rain", "snow", "fireflies", "stage"]) {
    await expect(page.locator('[data-key="bg:' + scene + '"]')).toHaveCount(0);
  }
  await expect(page.locator('[data-key="bg:aurora"]')).toBeVisible();
  await page.locator('[data-key="bg:waves"]').click();
  await expect(page.locator("#bg [data-background-wave]")).toHaveCount(2);
  await expect(page.getByRole("slider", { name: "Background speed" })).toBeVisible();
});

test("an unavailable saved WebGL scene keeps its base and saved preference", async ({ page }) => {
  await disableWebGL(page);
  await open(page, "nebula");
  await expect(page.locator("#bg canvas")).toHaveCount(0);
  await expect(page.locator("#bg [data-background-blob]")).toHaveCount(0);
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(5, 4, 12)");
  await page.locator("#gear").click();
  await openCategory(page, "wallpaper");
  await expect(page.getByText("Your saved wallpaper is shown without animation on this device.")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Background speed" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#bg canvas")).toHaveCount(0);
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().background)).toBe("nebula");
});
