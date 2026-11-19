const { test, expect } = require("@playwright/test");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");

const PREVIEW_URL = "http://127.0.0.1:8172/";

test("Cinema switches layouts and follows remote focus across the Home rails", async ({ page }) => {
  const home = page.locator("[data-home]");
  const feature = page.locator("[data-cinema-feature]");
  const title = feature.locator("h1");
  const sourceBadge = feature.locator('[data-continue-part="source-badge"]');
  const backdrop = page.locator('[data-cinema-backdrop][data-visible="true"]');
  const backing = page.locator("[data-cinema-backing]");
  const wallpaper = page.locator("[data-background-blob]").first();
  const programmes = page.locator("#continue-items > [data-key]");
  const apps = page.locator("#grid > [data-id]");
  const inputs = page.locator("#inputs [data-input-card]");
  const appearance = page.locator('[data-key="home-app-layout:grid"]');
  const cardArtwork = (card) => card.locator('[data-continue-part="image"]').getAttribute("src");

  await page.route("https://api.github.com/repos/helalaou/AeroTizen/releases?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.addInitScript(() => {
    const key = "aerotizen.settings.v1";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({
          home: ["demo0", "demo1", "demo2", "demo3", "demo4", "demo5", "demo6", "demo7", "demo8"],
          homeCardColumns: 4,
          homeAppLayout: "grid",
          background: "aurora",
        }),
      );
    }
  });
  await page.goto(PREVIEW_URL);
  await expect(home).toHaveAttribute("data-layout", "standard");

  await test.step("Save Cinema through Appearance and reload", async () => {
    await page.locator("#gear").click();
    await openCategory(page, "appearance");
    await page.locator('[data-key="home-layout:cinema"]').click();
    await expect(appearance).toBeHidden();
    await closeSettings(page);
    await page.reload();
    await expect(home).toHaveAttribute("data-layout", "cinema");
    await expect(programmes.first()).toBeVisible();
    await expect(inputs.first()).not.toBeInViewport();
    await page.locator("#home-tab").click();

    for (const railEdge of [programmes.nth(4), apps.last()]) {
      await expect(railEdge).toBeInViewport();
      await expect(railEdge).not.toBeInViewport({ ratio: 0.95 });
    }
    const firstCard = await programmes.first().boundingBox();
    const firstApp = await apps.first().boundingBox();
    const secondApp = await apps.nth(1).boundingBox();
    expect(firstCard.width / firstCard.height).toBeCloseTo(16 / 9);
    expect(firstCard.x).toBeCloseTo(firstApp.x, 0);
    expect(firstCard.x + firstCard.width).toBeCloseTo(secondApp.x + secondApp.width, 0);
  });

  await test.step("Show focused programme details and fade between card images", async () => {
    await page.keyboard.press("ArrowDown");
    await expect(programmes.first()).toBeFocused();
    await expect(programmes.first()).toHaveText("");
    await expect(programmes.first()).toHaveAccessibleName(/After the Tide/);
    await expect(title).toHaveText("After the Tide");
    await expect(sourceBadge).toHaveText("Netflix");
    await expect(feature).toContainText("S1 E3");
    const badgeTop = await sourceBadge.evaluate((node) => node.getBoundingClientRect().top);
    const firstArtwork = await cardArtwork(programmes.first());
    await expect(backdrop).toHaveAttribute("src", firstArtwork);
    await expect(backdrop).toHaveCSS("opacity", "1");
    await expect(backing).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(backing).toHaveCSS("opacity", "1");
    await expect(wallpaper).toHaveCSS("animation-play-state", "paused");
    const artBounds = await backdrop.boundingBox();
    const homeBounds = await home.boundingBox();
    const appBounds = await apps.first().boundingBox();
    expect(artBounds.width / homeBounds.width).toBeCloseTo(0.8);
    expect(artBounds.x + artBounds.width).toBeCloseTo(homeBounds.x + homeBounds.width, 0);
    expect(artBounds.y + artBounds.height).toBeLessThan(appBounds.y);

    await backdrop.evaluate((image) => {
      image.addEventListener(
        "transitionend",
        (event) => (image.ownerDocument.body.dataset.testFade = event.propertyName),
        { once: true },
      );
    });
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText("Paper Moons");
    await expect(backdrop).toHaveAttribute("src", await cardArtwork(programmes.nth(1)));
    await expect(page.locator("body")).toHaveAttribute("data-test-fade", "opacity");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText(/Signal North/);
    const lines = await title.evaluate((node) => node.clientHeight / parseFloat(getComputedStyle(node).lineHeight));
    expect(Math.round(lines)).toBe(3);
    expect(await sourceBadge.evaluate((node) => node.getBoundingClientRect().top)).toBeCloseTo(badgeTop);
  });

  await test.step("Return to the wallpaper on apps and reveal inputs below the fold", async () => {
    await page.keyboard.press("ArrowDown");
    const focusedApp = page.locator("#grid [data-focused=true]");
    await expect(focusedApp).toBeFocused();
    await expect(feature).toBeHidden();
    await expect(backing).toHaveCSS("opacity", "0");
    await expect(wallpaper).toHaveCSS("animation-play-state", "running");
    await expect(inputs.first()).not.toBeInViewport();
    await page.keyboard.press("ArrowDown");
    const focusedInput = page.locator("#inputs [data-focused=true]");
    await expect(focusedInput).toBeFocused();
    await expect(focusedInput).toBeInViewport();
    await page.keyboard.press("ArrowUp");
    await expect(focusedApp).toBeFocused();
    await expect(inputs.first()).not.toBeInViewport();
  });

  await test.step("Use All Apps and restore the saved Standard arrangement", async () => {
    await page.locator("#home-tab").click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#apps-tab")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#grid")).toHaveAttribute("data-columns", "5");
    await page.locator("#gear").click();
    await openCategory(page, "appearance");
    await page.locator('[data-key="home-layout:standard"]').click();
    await expect(appearance).toHaveAttribute("aria-pressed", "true");
  });
});
