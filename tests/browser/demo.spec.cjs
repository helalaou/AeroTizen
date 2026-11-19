const { test, expect } = require("@playwright/test");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");
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
  await launcher.locator("#samsung-home-shortcut").click();
  await expect(launcher.locator("#toast")).toHaveText("Would open Samsung Home");
  await launcher.locator("#gear").click();
  await expect(launcher.locator("#editor")).toBeVisible();
  await expect(launcher.locator("#toast")).toBeHidden();
  await launcher.locator("#escape").click();
  await expect(launcher.locator("#toast")).toHaveText("Would open Samsung Home");
  await openCategory(launcher, "sources");
  await launcher.getByRole("button", { name: "Find input" }).click();
  await expect(launcher.locator("#toast")).toHaveText("HDMI 5 added to Home.");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(launcher.locator("#editor")).toBeHidden();
  const learnedInput = launcher.getByRole("button", { name: "HDMI 5", exact: true });
  await expect(learnedInput).toBeVisible();
  await learnedInput.click();
  await expect(launcher.locator("#toast")).toHaveText("Would switch to HDMI 5");
  expect(bridgeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("Cinema follows remote focus across the header and rails and preserves Standard choices", async ({ page }) => {
  const launcher = page.frameLocator("iframe");
  const layout = launcher.locator("[data-home]");
  const viewport = launcher.locator("[data-home-viewport]");
  const hero = launcher.locator("[data-cinema-feature]");
  const backdrop = launcher.locator('[data-cinema-backdrop][data-visible="true"]');
  const blackBacking = launcher.locator("[data-cinema-backing]");
  const wallpaper = launcher.locator("[data-background-blob]").first();
  const programmes = launcher.locator("#continue-items > [data-key]");
  const apps = launcher.locator("#grid > [data-id]");
  const inputs = launcher.locator("#inputs [data-input-card]");
  const sizeChoice = launcher.locator('[data-key="home-card-columns:4"]');
  const arrangement = launcher.locator('[data-key="home-app-layout:grid"]');
  const clockChoice = launcher.locator('[data-key="clock-layouts:vertical"]');
  const headerStatus = launcher.locator("[data-header-status]");
  const badgeAppearance = (badge) =>
    badge.evaluate((node) => {
      const { background, borderRadius, boxShadow, width, height } = getComputedStyle(node);
      return { background, borderRadius, boxShadow, width, height, text: node.innerText };
    });

  await page.addInitScript(() => {
    const key = "aerotizen.settings.v1";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify({
          home: ["demo0", "demo1", "demo2", "demo3", "demo4", "demo5", "demo6", "demo7", "demo8"],
          homeCardColumns: 4,
          homeAppLayout: "grid",
          clockLayout: "custom",
          aeroClockStyle: "vertical",
          background: "aurora",
        }),
      );
    }
  });
  await page.goto(DEMO_URL);
  await expect(layout).toHaveAttribute("data-layout", "standard");
  const cornerBadge = programmes.first().locator('[data-continue-part="source-badge"]');
  await expect(cornerBadge).toHaveText("Netflix");
  const standardBadge = await badgeAppearance(cornerBadge);

  await test.step("Select Cinema and reload", async () => {
    await launcher.locator("#gear").click();
    await openCategory(launcher, "appearance");
    await launcher.locator('[data-key="home-layout:cinema"]').click();
    await expect(sizeChoice).toHaveAttribute("aria-pressed", "true");
    await expect(arrangement).toBeHidden();
    await openCategory(launcher, "status");
    await expect(clockChoice).toHaveAttribute("aria-pressed", "true");
    await closeSettings(launcher, page.keyboard);
    await page.reload();
    await expect(layout).toHaveAttribute("data-layout", "cinema");
    await expect(headerStatus).toHaveAttribute("data-expanded", "true");
    await expect(programmes.first()).toBeVisible();
    await expect(inputs.first()).not.toBeInViewport();
    await expect(launcher.getByRole("heading", { name: "Home apps" })).toHaveCount(0);
    for (const peek of [programmes.nth(4), apps.last()]) {
      await expect(peek).toBeInViewport();
      await expect(peek).not.toBeInViewport({ ratio: 0.95 });
    }
    await launcher.locator("#home-tab").click();
    await expect
      .poll(() =>
        layout.evaluate((home) => {
          const tiles = home.querySelectorAll("#grid > [data-id]");
          const cards = home.querySelectorAll("#continue-items > [data-key]");
          const gaps = [];
          for (let pair = 0; pair * 2 + 1 < tiles.length; pair++) {
            const programme = cards[pair].getBoundingClientRect();
            const first = tiles[pair * 2].getBoundingClientRect();
            const last = tiles[pair * 2 + 1].getBoundingClientRect();
            gaps.push([Math.round(first.left - programme.left), Math.round(last.right - programme.right)]);
          }
          return gaps;
        }),
      )
      .toEqual(Array.from({ length: Math.floor((await apps.count()) / 2) }, () => [0, 0]));
    const clockBounds = await headerStatus.boundingBox();
    const railBounds = await launcher.locator("#continue-items").boundingBox();
    expect(clockBounds.y + clockBounds.height).toBeLessThan(railBounds.y);
  });

  await test.step("Fade between the original demo card images", async () => {
    await expect(blackBacking).toHaveCSS("opacity", "0");
    await expect(wallpaper).toHaveCSS("animation-play-state", "running");
    await page.keyboard.press("ArrowDown");
    await expect(programmes.first()).toBeFocused();
    await expect(programmes.first()).toHaveText("");
    await expect(programmes.first()).toHaveAccessibleName(/After the Tide/);
    expect(await programmes.first().evaluate((card) => card.offsetWidth / card.offsetHeight)).toBeCloseTo(16 / 9);
    const sourceBadge = hero.locator('[data-continue-part="source-badge"]');
    const title = hero.locator("h1");
    await expect(sourceBadge).toHaveText("Netflix");
    expect(await badgeAppearance(sourceBadge)).toEqual(standardBadge);
    await expect(hero).toContainText("S1 E3");
    const badgeTop = await sourceBadge.evaluate((node) => node.getBoundingClientRect().top);
    const titleBottom = await title.evaluate((node) => node.getBoundingClientRect().bottom);
    await expect(backdrop).toHaveCSS("opacity", "1");
    await expect(blackBacking).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await expect(blackBacking).toHaveCSS("opacity", "1");
    await expect(wallpaper).toHaveCSS("animation-play-state", "paused");
    await expect(backdrop).toHaveCSS("object-fit", "contain");
    const artworkBounds = await backdrop.boundingBox();
    const layoutBounds = await layout.boundingBox();
    const appBounds = await apps.first().boundingBox();
    expect(artworkBounds.width / artworkBounds.height).toBeCloseTo(16 / 9);
    expect(artworkBounds.x).toBeGreaterThan(layoutBounds.x);
    expect(artworkBounds.x + artworkBounds.width).toBeCloseTo(layoutBounds.x + layoutBounds.width, 0);
    expect(artworkBounds.y + artworkBounds.height).toBeLessThan(appBounds.y);
    await expect(backdrop).toHaveAttribute(
      "src",
      await programmes.first().locator('[data-continue-part="image"]').getAttribute("src"),
    );
    await backdrop.evaluate((image) => {
      image.addEventListener("transitionend", () => image.ownerDocument.body.setAttribute("data-test-faded", "true"), {
        once: true,
      });
    });
    await page.keyboard.press("ArrowRight");
    await expect(hero.locator("h1")).toHaveText("Paper Moons");
    await expect(sourceBadge).toHaveText("Prime Video");
    await expect(launcher.locator("body")).toHaveAttribute("data-test-faded", "true");
    await expect(backdrop).toHaveAttribute(
      "src",
      await programmes.nth(1).locator('[data-continue-part="image"]').getAttribute("src"),
    );
    await expect
      .poll(() =>
        programmes
          .nth(1)
          .locator('[data-continue-part="image"]')
          .evaluate((image) => image.naturalWidth),
      )
      .toBeGreaterThan(0);

    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText("The Lantern Trail");
    await expect(backdrop).toHaveAttribute(
      "src",
      await programmes.nth(2).locator('[data-continue-part="image"]').getAttribute("src"),
    );
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText(/Signal North/);
    expect(
      await title.evaluate((node) => {
        const lineHeight = parseFloat(getComputedStyle(node).lineHeight);
        const text = node.ownerDocument.createRange();
        text.selectNodeContents(node);
        return {
          visibleLines: Math.round(node.clientHeight / lineHeight),
          textLines: new Set(Array.from(text.getClientRects(), (rect) => rect.top)).size,
        };
      }),
    ).toEqual({ visibleLines: 3, textLines: 3 });
    expect(await sourceBadge.evaluate((node) => node.getBoundingClientRect().top)).toBeCloseTo(badgeTop);
    expect(await title.evaluate((node) => node.getBoundingClientRect().bottom)).toBeCloseTo(titleBottom);
    for (let index = 4; index < CONTINUE_WATCHING_COUNT; index++) await page.keyboard.press("ArrowRight");
    await expect(programmes.last()).toBeFocused();
    await expect(programmes.last()).toBeInViewport({ ratio: 0.95 });
    await expect(programmes.nth(2)).toBeInViewport();
    await expect(programmes.nth(2)).not.toBeInViewport({ ratio: 0.95 });
    await expect(hero.locator("h1")).toHaveText("Midnight Dispatch");
    await expect(backdrop).toHaveAttribute(
      "src",
      await programmes.last().locator('[data-continue-part="image"]').getAttribute("src"),
    );
  });

  await test.step("Scroll the bottom app rail and reveal the inputs on demand", async () => {
    await page.keyboard.press("ArrowDown");
    await expect(hero).toBeHidden();
    await expect(backdrop).toHaveCount(0);
    await expect(blackBacking).toHaveCSS("opacity", "0");
    await expect(wallpaper).toHaveCSS("animation-play-state", "running");
    await expect(launcher.locator("#grid [data-focused=true]")).toBeFocused();
    for (let index = 1, count = await apps.count(); index < count; index++) await page.keyboard.press("ArrowRight");
    await expect(apps.last()).toBeFocused();
    await expect(apps.last()).toBeInViewport({ ratio: 0.95 });
    await expect(apps.first()).toBeInViewport();
    await expect(apps.first()).not.toBeInViewport({ ratio: 0.95 });
    await expect(inputs.first()).not.toBeInViewport();
    await page.keyboard.press("ArrowDown");
    await expect(launcher.locator("#inputs [data-focused=true]")).toBeFocused();
    await expect(launcher.locator("#inputs [data-focused=true]")).toBeInViewport();
    await page.keyboard.press("ArrowUp");
    await expect(launcher.locator("#grid [data-focused=true]")).toBeFocused();
    await expect(viewport).toHaveJSProperty("scrollTop", 0);
    await expect(inputs.first()).not.toBeInViewport();
    await page.mouse.move(960, 900);
    await page.mouse.wheel(0, 400);
    await expect(inputs.first()).toBeInViewport({ ratio: 0.95 });
  });

  await test.step("Reach Apps and Settings through the header and restore Standard", async () => {
    await launcher.locator("#home-tab").click();
    await page.keyboard.press("ArrowRight");
    await expect(launcher.locator("#apps-tab")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(launcher.locator("#apps-tab")).toHaveAttribute("aria-pressed", "true");
    await expect(launcher.locator("#grid")).toHaveAttribute("data-columns", "5");
    for (let index = 0; index < 3; index++) await page.keyboard.press("ArrowLeft");
    await expect(launcher.locator("#gear")).toBeFocused();
    await page.keyboard.press("Enter");
    await openCategory(launcher, "appearance");
    await launcher.locator('[data-key="home-layout:standard"]').click();
    await expect(sizeChoice).toHaveAttribute("aria-pressed", "true");
    await expect(arrangement).toHaveAttribute("aria-pressed", "true");
    await openCategory(launcher, "status");
    await expect(clockChoice).toHaveAttribute("aria-pressed", "true");
  });
});
