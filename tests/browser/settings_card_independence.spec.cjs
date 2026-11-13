const { test, expect } = require("./launcher_fixture.cjs");
const path = require("node:path");

const { loadTypeScript } = require("../helpers/load_typescript.cjs");
const { catalogues } = loadTypeScript(path.join(__dirname, "../../launcher/src/shared/i18n/catalogues.ts"));

const openAddAppsCard = async (page, language) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript((language) => {
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({ language, home: ["demo0"], background: "black", showWeather: false }),
    );
  }, language);
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.locator("#gear").click();
  await page.locator('[data-key="section:apps"]').click();
  return page.locator('#all-apps [data-key="add"]');
};

test("Home columns never change standard Settings icons or artwork nodes", async ({ page }) => {
  await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
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

for (const theme of ["classic", "glass"]) {
  test(`${theme} Add apps shares its appearance between All apps and Settings`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((theme) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ theme, language: "en", home: ["demo0"], background: "black", showWeather: false }),
      );
    }, theme);
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    const appearance = (card) =>
      card.evaluate((node) => {
        const read = (element, properties, pseudo = null) => {
          const style = getComputedStyle(element, pseudo);
          return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
        };
        return {
          frame: read(node, ["background", "border-radius", "border-width", "border-style", "box-shadow", "transform"]),
          ring: read(node, ["border-radius", "box-shadow", "opacity"], "::after"),
          parts: Array.from(node.querySelectorAll("[data-app-store-part]"), (part) =>
            read(part, ["color", "font-family", "font-weight", "text-align", "text-shadow", "letter-spacing"]),
          ),
        };
      });
    await page.locator("#apps-tab").click();
    const large = page.locator("#grid").getByRole("button", { name: "Add apps", exact: true });
    const largeUnfocused = await appearance(large);
    expect(largeUnfocused.ring.opacity).toBe("0");
    await page.keyboard.press("ArrowDown");
    await expect(large).toBeFocused();
    await expect.poll(async () => (await appearance(large)).ring.opacity).toBe("1");
    const largeFocused = await appearance(large);
    const largeBounds = await large.boundingBox();

    await page.locator("#gear").click();
    await page.locator('[data-key="section:apps"]').click();
    const small = page.locator('#all-apps [data-key="add"]');
    await expect(small).toBeFocused();
    await expect.poll(() => appearance(small)).toEqual(largeFocused);
    const focusPlate = page.locator('[data-settings-focus="content"]');
    await expect(focusPlate).not.toHaveAttribute("data-visible", "true");
    const smallBounds = await small.boundingBox();
    expect(smallBounds.width).toBe(smallBounds.height);
    expect(largeBounds.width).toBe(largeBounds.height);
    expect(largeBounds.width).toBeGreaterThan(smallBounds.width);
    await page.keyboard.press("ArrowRight");
    await expect(small).not.toBeFocused();
    await expect.poll(() => appearance(small)).toEqual(largeUnfocused);
    await expect(focusPlate).toHaveAttribute("data-visible", "true");
  });

  test(`${theme} Settings cards retain styles without the editor ID`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((theme) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({ theme, home: ["demo0"], background: "black", showWeather: false }),
      );
    }, theme);
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
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
    });
    expect(await inspect()).toEqual(before);
    const app = page.locator('#all-apps [data-key="app:demo0"]');
    await app.click();
    await expect(app).toHaveAttribute("data-focused", "true");
    await expect(app).toHaveAttribute("aria-pressed", "false");
  });
}

for (const language of Object.keys(catalogues)) {
  test(`the add-apps card holds its icon, name and store line in ${language}`, async ({ page }) => {
    const card = await openAddAppsCard(page, language);
    const overflow = await card.evaluate((node) => {
      const frame = node.getBoundingClientRect();
      const parts = Array.from(node.querySelectorAll("[data-app-store-part]"), (part) => part.getBoundingClientRect());
      return {
        above: frame.top - Math.min(...parts.map((part) => part.top)),
        below: Math.max(...parts.map((part) => part.bottom)) - frame.bottom,
      };
    });
    expect(overflow.above).toBeLessThan(1);
    expect(overflow.below).toBeLessThan(1);
  });
}

test("the add-apps icon keeps its size when the text fits", async ({ page }) => {
  const card = await openAddAppsCard(page, "en");
  await expect(card.locator("svg")).toHaveCSS("height", "76px");
});
