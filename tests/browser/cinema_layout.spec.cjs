const { test, expect } = require("@playwright/test");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");

const PREVIEW_URL = "http://127.0.0.1:8172/";

test("Cinema switches layouts and follows remote focus across the Home rails", async ({ page }) => {
  const home = page.locator("[data-home]");
  const header = page.locator("[data-home-header]");
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
  const expectDocked = async (card) => {
    await expect(card).toBeInViewport({ ratio: 0.95 });
    await expect
      .poll(() => card.evaluate((node) => document.documentElement.clientHeight - node.getBoundingClientRect().bottom))
      .toBeLessThan(64);
  };

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

  await test.step("Save Cinema and start on the docked Continue Watching rail", async () => {
    await page.locator("#gear").click();
    await openCategory(page, "appearance");
    await page.locator('[data-key="home-layout:cinema"]').click();
    await expect(appearance).toBeHidden();
    await closeSettings(page);
    await page.reload();
    await expect(home).toHaveAttribute("data-layout", "cinema");
    await expect(programmes.first()).toBeFocused();
    await expectDocked(programmes.first());
    await expect(apps.first()).not.toBeInViewport();
    await expect(inputs.first()).not.toBeInViewport();
    await expect(programmes.nth(4)).toBeInViewport();
    await expect(programmes.nth(4)).not.toBeInViewport({ ratio: 0.95 });

    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#home-tab")).toBeFocused();
    const firstCard = await programmes.first().boundingBox();
    expect(firstCard.width / firstCard.height).toBeCloseTo(16 / 9);
    await expect
      .poll(() =>
        home.evaluate((node) => {
          const card = node.querySelector("#continue-items > [data-key]").getBoundingClientRect();
          const [first, second] = node.querySelectorAll("#grid > [data-id]");
          return Math.max(
            Math.abs(card.left - first.getBoundingClientRect().left),
            Math.abs(card.right - second.getBoundingClientRect().right),
          );
        }),
      )
      .toBeLessThan(1);
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
    expect(artBounds.x).toBeCloseTo(homeBounds.x, 0);
    expect(artBounds.x + artBounds.width).toBeCloseTo(homeBounds.x + homeBounds.width, 0);
    expect(artBounds.width / artBounds.height).toBeCloseTo(16 / 9);

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

  await test.step("Dock apps on Down and reveal inputs on the next Down", async () => {
    const headerPosition = await header.boundingBox();
    const programmePosition = await programmes.first().boundingBox();
    await page.keyboard.press("ArrowDown");
    const focusedApp = page.locator("#grid [data-focused=true]");
    await expect(focusedApp).toBeFocused();
    await expectDocked(focusedApp);
    expect((await programmes.first().boundingBox()).y).toBeLessThan(programmePosition.y);
    expect(await header.boundingBox()).toEqual(headerPosition);
    await expect(apps.last()).toBeInViewport();
    await expect(apps.last()).not.toBeInViewport({ ratio: 0.95 });
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
    await expectDocked(focusedApp);
    await expect(inputs.first()).not.toBeInViewport();
    await page.keyboard.press("ArrowUp");
    const focusedProgramme = page.locator("#continue-items [data-focused=true]");
    await expect(focusedProgramme).toBeFocused();
    await expectDocked(focusedProgramme);
    await expect(apps.first()).not.toBeInViewport();
    await expect(backdrop).toBeVisible();
  });

  await test.step("Start with apps when Continue Watching is off or empty", async () => {
    await page.evaluate(() => AeroTizen.settings.update({ continueWatching: false }));
    await page.reload();
    await expect(programmes.first()).toBeHidden();
    await expect(apps.first()).toBeFocused();
    await expectDocked(apps.first());
    await expect(inputs.first()).not.toBeInViewport();

    await page.evaluate(() => AeroTizen.settings.update({ continueWatching: true, continueWatchingApps: [] }));
    await page.reload();
    await expect(programmes.first()).toBeHidden();
    await expect(apps.first()).toBeFocused();
    await expectDocked(apps.first());
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
