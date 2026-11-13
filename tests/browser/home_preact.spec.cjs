const { test, expect } = require("./launcher_fixture.cjs");
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
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  const first = page.locator("#grid > [data-id]").first();
  await expect(first).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toContainText("Would open YouTube");
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("data-moving", "true");
  await expect(page.locator("#toast")).toHaveText("Use the arrows to move it, OK to drop");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home[0])).toBe("demo0");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home.slice(0, 2))).toEqual(["demo1", "demo0"]);
  await expect(page.locator("#toast")).toBeHidden();
  await page.locator("#gear").click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#grid > [data-id]").nth(1)).toHaveAttribute("data-focused", "true");
  await page.reload();
  await expect(page.locator("#grid > [data-id]").first()).toHaveAttribute("data-id", "demo1");
  expect(errors).toEqual([]);
});

const openHome = async (page, home = ["demo0", "demo1"]) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate((home) => AeroTizen.settings.update({ home }), home);
  await expect(page.locator("#grid > [data-id]").first()).toBeFocused();
};

const openActions = async (page) => {
  await page.keyboard.down("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.up("Enter");
};

test("a short OK launches once despite repeats; Back from actions permits the next launch", async ({ page }) => {
  await openHome(page);
  await page.evaluate(() => {
    window.appLaunches = [];
    AeroTizen.apps.launch = (app) => window.appLaunches.push(app.id);
  });
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  expect(await page.evaluate(() => window.appLaunches)).toEqual([]);
  await page.keyboard.up("Enter");
  expect(await page.evaluate(() => window.appLaunches)).toEqual(["demo0"]);
  await openActions(page);
  expect(await page.evaluate(() => window.appLaunches)).toEqual(["demo0"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.appLaunches)).toEqual(["demo0", "demo0"]);
});

test("removing a Home favourite preserves focus and persists the remaining order", async ({ page }) => {
  await openHome(page);
  await openActions(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Remove from Home" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("#grid > [data-id]")).toHaveCount(1);
  await expect(page.locator('#grid > [data-id="demo1"]')).toBeFocused();
  await page.reload();
  await expect(page.locator('#grid > [data-id="demo1"]')).toBeFocused();
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual(["demo1"]);
});

test("All apps actions add and remove a favourite without removing the app card", async ({ page }) => {
  await openHome(page, ["demo0"]);
  await page.locator("#apps-tab").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  const cards = page.locator("#grid > [data-id]");
  const count = await cards.count();
  const favourite = await cards.first().getAttribute("data-id");
  await page.evaluate((id) => AeroTizen.settings.update({ home: [id] }), favourite);
  await expect(cards.first()).toBeFocused();
  await openActions(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Remove from Home"]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([]);
  await expect(cards).toHaveCount(count);
  await expect(cards.first()).toBeFocused();
  await openActions(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Add to Home"]);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([favourite]);
  await expect(cards).toHaveCount(count);
});

for (const theme of ["classic", "glass"]) {
  test(`All apps opens the store with remote or pointer in ${theme}`, async ({ page }) => {
    await openHome(page);
    await page.evaluate((theme) => {
      AeroTizen.settings.update({ theme, homeCardColumns: 5 });
      window.storeOpens = 0;
      AeroTizen.apps.openStore = () => window.storeOpens++;
    }, theme);
    await page.locator("#apps-tab").click();
    const store = page.locator("#grid").getByRole("button", { name: "Add apps", exact: true });
    await expect(store).toContainText("Samsung app store");
    await expect(page.locator("#grid > [role=button]").first()).toHaveAccessibleName("Add apps");
    await page.keyboard.press("ArrowDown");
    await expect(store).toBeFocused();
    await expect(store).toBeInViewport();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#grid > [data-id]").first()).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(store).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.storeOpens)).toBe(1);
    await page.clock.install();
    await page.keyboard.down("Enter");
    await page.clock.runFor(await page.evaluate(() => AeroTizen.config.LONG_PRESS_MS));
    await page.keyboard.up("Enter");
    await expect(page.getByRole("menu")).toBeHidden();
    expect(await page.evaluate(() => window.storeOpens)).toBe(1);
    await store.click();
    expect(await page.evaluate(() => window.storeOpens)).toBe(2);
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual(["demo0", "demo1"]);
    await page.locator("#gear").click();
    await page.locator('[data-key="section:apps"]').click();
    const settingsStore = page.locator('#all-apps [data-key="add"]');
    await expect(settingsStore).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.storeOpens)).toBe(3);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    await expect(store).toBeFocused();
    // Move through the six app rows to the footer.
    for (let row = 0; row < 6; row++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(page.getByRole("button", { name: "Back to top" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(store).toBeFocused();
    await expect(page.locator("[data-home-viewport]")).toHaveAttribute("data-scrolled", "false");
    await page.evaluate(() => AeroTizen.settings.update({ clockLayout: "custom", language: "fr" }));
    const compactStore = page.locator("#grid").getByRole("button", { name: "Ajouter des applis", exact: true });
    await expect(compactStore).toContainText("Boutique d’applications Samsung");
    const dimensions = await compactStore.evaluate((card) => {
      const bounds = card.getBoundingClientRect();
      const icon = card.querySelector("svg").getBoundingClientRect();
      return {
        iconHeight: icon.height,
        overflow: card.scrollHeight - card.clientHeight,
        childrenFit: [...card.querySelectorAll("[data-app-store-part]")].every((child) => {
          const childBounds = child.getBoundingClientRect();
          return childBounds.top >= bounds.top && childBounds.bottom <= bounds.bottom;
        }),
      };
    });
    expect(dimensions.iconHeight).toBeGreaterThan(40);
    expect(dimensions.overflow).toBe(0);
    expect(dimensions.childrenFit).toBe(true);
    await page.evaluate(() => AeroTizen.settings.update({ language: "en" }));
    await page.keyboard.press("Escape");
    await expect(page.locator("#grid").getByRole("button", { name: "Add apps", exact: true })).toHaveCount(0);
  });
}

test("All apps keeps the store reachable when no apps are installed", async ({ page }) => {
  await page.addInitScript(() => {
    window.tizen = { application: { getAppsInfo: (done) => done([]) } };
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => {
    window.storeOpens = 0;
    AeroTizen.apps.openStore = () => window.storeOpens++;
  });
  await page.locator("#apps-tab").click();
  await expect(page.locator("#apps-empty")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#grid").getByRole("button", { name: "Add apps", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.storeOpens)).toBe(1);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#apps-tab")).toBeFocused();
});

for (const withInputs of [true, false]) {
  test(`removing the last favourite restores focus to ${withInputs ? "Inputs" : "Home"}`, async ({ page }) => {
    if (!withInputs) {
      await page.addInitScript(() => {
        window.tizen = {
          systeminfo: {
            getPropertyValue(name, done, failed) {
              if (name === "VIDEOSOURCE") done({ connected: [], disconnected: [] });
              else failed?.();
            },
          },
        };
      });
    }
    await openHome(page, ["demo0"]);
    await openActions(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#grid > [data-id]")).toHaveCount(0);
    const target = withInputs ? page.locator("#inputs [data-input-card]").first() : page.locator("#home-tab");
    await expect(target).toBeFocused();
    expect(await page.evaluate(() => AeroTizen.settings.getSnapshot().home)).toEqual([]);
  });
}

test("holding OK on a navigation tab does not open app actions", async ({ page }) => {
  await openHome(page);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#home-tab")).toBeFocused();
  await page.keyboard.down("Enter");
  const holdMs = await page.evaluate(() => AeroTizen.config.LONG_PRESS_MS);
  await page.waitForTimeout(holdMs + 100);
  await page.keyboard.up("Enter");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.locator("#toast")).toBeHidden();
});

test("Home and All apps retain keyed artwork nodes and Back returns to Home", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => {
    window.originalHome = document.querySelector("#grid > [data-id]");
  });
  await page.locator("#apps-tab").click();
  await expect(page.locator("#grid > [data-id]")).toHaveCount(25);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#grid > [data-id]").first()).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#grid > [data-id]")).toHaveCount(4);
  expect(await page.evaluate(() => window.originalHome === document.querySelector("#grid > [data-id]"))).toBe(true);
  await expect(page.locator("#home-tab")).toHaveAttribute("data-focused", "true");
});
test("Back to top restores scroll and focus from below a partial app row", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "aerotizen.settings.v1";
    const settings = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...settings, homeCardColumns: 4 }));
  });
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  const button = page.getByRole("button", { name: "Back to top" });
  await expect(button).toHaveCount(0);
  await page.locator("#apps-tab").click();

  for (let row = 0; row < 7; row++) {
    await page.keyboard.press("ArrowDown");
  }
  const tiles = page.locator("#grid > [data-id]");
  const cards = page.locator("#grid > [role=button]");
  const columns = await page.evaluate(() => AeroTizen.settings.getSnapshot().homeCardColumns);
  const lastRowStart = Math.floor(((await cards.count()) - 1) / columns) * columns;
  const lastRowFirst = cards.nth(lastRowStart);
  await expect(lastRowFirst).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(button).toBeFocused();
  await expect(button).toBeInViewport();
  await expect(page.locator("[data-home-viewport]")).toHaveAttribute("data-scrolled", "true");
  await expect
    .poll(() =>
      lastRowFirst.evaluate((tile) => {
        const viewport = tile.closest("[data-home-viewport]");
        return tile.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      }),
    )
    .toBeCloseTo(16, 0);
  const viewportBounds = await page.locator("[data-home-viewport]").boundingBox();
  const buttonBounds = await button.boundingBox();
  expect(viewportBounds.y + viewportBounds.height - buttonBounds.y - buttonBounds.height).toBeCloseTo(80, 0);
  const fill = await button.evaluate((node) => getComputedStyle(node).background);
  await page.keyboard.press("ArrowUp");
  await expect(lastRowFirst).toBeFocused();
  await expect.poll(async () => (await button.boundingBox()).y).toBeCloseTo(buttonBounds.y, 0);
  await expect(button).toHaveCSS("background", fill);
  await page.keyboard.press("ArrowUp");
  await expect(button).not.toBeInViewport();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#grid").getByRole("button", { name: "Add apps", exact: true })).toBeFocused();
  await expect(page.locator("[data-home-viewport]")).toHaveAttribute("data-scrolled", "false");
  await expect(tiles.first()).toBeInViewport();
});
test("Home docks Inputs with one app row and leaves them in flow with two rows", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => {
    AeroTizen.settings.update({ home: ["demo0", "demo1", "demo2"] });
    AeroTizen.settings.update({ homeCardColumns: 3 });
  });

  const inputs = page.locator("#inputs-section");
  const firstApp = page.locator("#grid > [data-id]").first();
  const firstInput = inputs.locator("[data-input-card]").first();
  await expect(inputs).toBeVisible();
  const bottomGap = await inputs.evaluate((section) => {
    const viewport = section.closest("[data-home-viewport]");
    return viewport.getBoundingClientRect().bottom - section.getBoundingClientRect().bottom;
  });
  expect(bottomGap).toBeCloseTo(96, 0);
  await page.keyboard.press("ArrowDown");
  await expect(firstInput).toBeFocused();
  await expect(page.locator("[data-home-viewport]")).toHaveAttribute("data-scrolled", "false");
  await page.keyboard.press("ArrowUp");
  await expect(firstApp).toBeFocused();

  await page.evaluate(() => {
    AeroTizen.settings.update({ home: [...AeroTizen.settings.getSnapshot().home, "demo3"] });
  });
  await expect(page.locator("#grid > [data-id]")).toHaveCount(4);
  const rowGap = await inputs.evaluate(
    (section) => section.getBoundingClientRect().top - document.getElementById("grid").getBoundingClientRect().bottom,
  );
  expect(rowGap).toBe(40);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#grid > [data-id]").last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(firstInput).toBeFocused();
});
