const { test, expect } = require("@playwright/test");
const { openCategory } = require("./drawer_helpers.cjs");

const DEMO_URL = "http://127.0.0.1:8174/demo/";
const HOME_APP_COUNT = 6;
const CONTINUE_WATCHING_COUNT = 7;
const INPUT_CARD_COUNT = 4;
const GLASS_FOCUS_COLOUR = "rgb(237, 242, 255)";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/repos/helalaou/AeroTizen/releases?*", (route) =>
    route.fulfill({ json: [] }),
  );
});

test("static demo loads its own sample data and assets from a project subpath", async ({ page }) => {
  const launcher = page.frameLocator("iframe");
  const errors = [];
  const bridgeRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().startsWith(DEMO_URL) && !response.ok()) errors.push(response.url());
  });
  page.on("request", (request) => {
    if (new URL(request.url()).port === "47790") bridgeRequests.push(request.url());
  });
  await page.goto(DEMO_URL);
  await expect(page).toHaveTitle("AeroTizen");
  await expect(launcher.locator("#grid > [data-id]")).toHaveCount(HOME_APP_COUNT);
  await expect(launcher.locator("#continue-items > [data-key]")).toHaveCount(CONTINUE_WATCHING_COUNT);
  await expect(launcher.locator("#inputs [data-input-card]")).toHaveCount(INPUT_CARD_COUNT);
  await expect(launcher.locator("vite-error-overlay")).toHaveCount(0);
  await expect(launcher.locator('script[src="js/launcher-ui.js"]')).toHaveCount(1);
  await expect(launcher.locator('script[src*="/src/"]')).toHaveCount(0);
  await expect(launcher.locator("#grid > [data-id]").first()).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("ArrowRight");
  await expect(launcher.locator("#grid > [data-id]").nth(1)).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Enter");
  await expect(launcher.locator("#toast-root")).toContainText("Would open Netflix");
  const programme = launcher.locator("#continue-items > [data-key]").first();
  await programme.click();
  await expect(programme).toHaveAttribute("data-focused", "true");
  await expect.poll(() => programme.evaluate((node) => getComputedStyle(node).boxShadow)).toContain(GLASS_FOCUS_COLOUR);
  await expect(programme.locator('[data-continue-part="progress-fill"]')).toHaveCSS(
    "background-color",
    GLASS_FOCUS_COLOUR,
  );
  await launcher.locator("#gear").click();
  await expect(launcher.locator("#editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(launcher.locator("#editor")).toBeHidden();
  expect(bridgeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("static demo keeps appearance, wallpaper and language choices after reload", async ({ page }) => {
  const launcher = page.frameLocator("iframe");
  await page.goto(DEMO_URL);
  await launcher.locator("#gear").click();
  await page.keyboard.press("ArrowRight");
  await expect(launcher.locator('[data-key="settings-appearance:false"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(launcher.locator('[data-key="settings-appearance:false"]')).toHaveAttribute("aria-pressed", "true");
  await openCategory(launcher, "wallpaper");
  await launcher.locator('[data-key="wallpaper-categories:animated"]').click();
  await launcher.locator('[data-key="bg:lava"]').click();
  await expect(launcher.locator('[data-key="bg:lava"]')).toHaveAttribute("aria-pressed", "true");
  await openCategory(launcher, "language");
  await launcher.locator('[data-key="language:fr"]').click();
  await expect(launcher.locator("html")).toHaveAttribute("lang", "fr");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(launcher.locator("#editor")).toBeHidden();
  await page.reload();
  await expect(launcher.locator("html")).toHaveAttribute("lang", "fr");
  await expect(launcher.locator("#grid > [data-id]")).toHaveCount(HOME_APP_COUNT);
  await launcher.locator("#gear").click();
  await expect(launcher.locator('[data-key="settings-appearance:false"]')).toHaveAttribute("aria-pressed", "true");
  await openCategory(launcher, "wallpaper");
  await launcher.locator('[data-key="wallpaper-categories:animated"]').click();
  await expect(launcher.locator('[data-key="bg:lava"]')).toHaveAttribute("aria-pressed", "true");
});

test("demo fits smaller windows and keeps remote focus after resizing", async ({ page }) => {
  const launcher = page.frameLocator("iframe");
  await page.goto(DEMO_URL);
  await expect(launcher.locator("#grid > [data-id]")).toHaveCount(HOME_APP_COUNT);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const bounds = await page.locator("iframe").boundingBox();
        const tolerancePx = 1;
        return (
          bounds.x >= -tolerancePx &&
          bounds.y >= -tolerancePx &&
          bounds.x + bounds.width <= viewport.width + tolerancePx &&
          bounds.y + bounds.height <= viewport.height + tolerancePx
        );
      })
      .toBe(true);
    await page.keyboard.press("ArrowRight");
  }
  await expect(launcher.locator("#grid > [data-id]").nth(2)).toHaveAttribute("data-focused", "true");
});
