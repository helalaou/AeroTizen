const { test, expect } = require("@playwright/test");

const english = require("../../launcher/src/shared/i18n/en.json");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");

const pseudoLanguage = "en-XA";
const mark = (text) => "⟦" + text + " åå⟧";
const marked = (key) => mark(english[key]);
const devUrl = "http://127.0.0.1:8172/";
const expectTextFits = async (locator) => {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
};

test("the production HTML shell contains no untranslated launcher copy", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const rawCopy = await page.evaluate(
    (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const textAttributes = [
        "alt",
        "aria-description",
        "aria-label",
        "aria-placeholder",
        "aria-roledescription",
        "aria-valuetext",
        "label",
        "placeholder",
        "title",
      ];
      const elements = doc.querySelectorAll(textAttributes.map((name) => "[" + name + "]").join(","));
      return {
        title: doc.title,
        body: doc.body.textContent.trim(),
        attributes: Array.from(elements).flatMap((element) =>
          textAttributes.map((name) => element.getAttribute(name)).filter((value) => value?.trim()),
        ),
      };
    },
    await response.text(),
  );
  // The product name is the only intentional text in the HTML shell.
  expect(rawCopy).toEqual({ title: "AeroTizen", body: "", attributes: [] });
});

for (const glassSettings of [false, true]) {
  test(`pseudo locale covers launcher text and remote focus in ${glassSettings ? "Glass" : "Classic"}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("https://geocoding-api.open-meteo.com/**", (route) => route.fulfill({ status: 503 }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
    const messages = Object.fromEntries(Object.entries(english).map(([key, text]) => [key, mark(text)]));
    messages["home.home"] = mark(english["home.home"] + " åååååååååå");
    await page.route("**/src/shared/i18n/catalogues.ts*", async (route) => {
      const response = await route.fetch();
      const catalogue = JSON.stringify({ name: "Pseudo", messages });
      // Inject only into the development response. The shipped IIFE includes English alone.
      await route.fulfill({
        response,
        body: (await response.text()) + "\ncatalogues[" + JSON.stringify(pseudoLanguage) + "] = " + catalogue + ";",
      });
    });
    await page.addInitScript((glass) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          glassSettings: glass,
          background: "black",
          continueWatching: true,
          inputNames: { "HDMI 1": "A & B <HD>" },
        }),
      );
      window.tizen = { application: { getAppsInfo: (done) => done([]) } };
    }, glassSettings);
    await page.goto(devUrl);
    const homeTab = page.locator("#home-tab");
    await expect(homeTab).toHaveText("Home");
    const englishWidth = await homeTab.evaluate((element) => element.getBoundingClientRect().width);
    await page.locator("#gear").click();
    await openCategory(page, "language");
    const pseudo = page.getByRole("button", { name: "Pseudo", exact: true });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(pseudo).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(pseudo).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("lang", pseudoLanguage);
    await expect(homeTab).toHaveText(messages["home.home"]);
    const translatedWidth = await homeTab.evaluate((element) => element.getBoundingClientRect().width);
    expect(translatedWidth).toBeGreaterThan(englishWidth);
    await expect
      .poll(() => page.locator(".header-focus-indicator--tabs").evaluate((element) => parseFloat(element.style.width)))
      .toBeCloseTo(translatedWidth);
    await expectTextFits(homeTab);
    await expectTextFits(page.locator('[data-key="language:auto"]'));
    await expect(page.locator(".settings-drawer__active-title")).toHaveText(marked("settings.language.title"));

    const visit = async (pane, messageKey) => {
      await page.keyboard.press("Escape");
      await openCategory(page, pane);
      await expectTextFits(
        page.locator(`[data-section-pane="${pane}"]`).getByText(marked(messageKey), { exact: true }),
      );
    };
    await visit("appearance", "appearance.title");
    await visit("apps", "continue.tvOnly");
    await visit("wallpaper", "scene.black");
    await visit("status", "clock.layout");
    const search = page.getByPlaceholder(marked("weather.searchPlaceholder"));
    await expect(search).toHaveAccessibleName(marked("weather.locationLabel"));
    await page.locator('[data-key="weather:search"]').click();
    await expect(page.locator("#weather-search-status")).toHaveText(marked("weather.searchTooShort"));
    await search.fill("London");
    await page.locator('[data-key="weather:search"]').click();
    await expect(page.locator("#weather-search-status")).toHaveText(marked("weather.searchFailed"));
    await visit("sources", "inputs.keepVisible");
    const input = page.getByRole("textbox", { name: mark("HDMI 1 name") });
    await expect(input).toHaveValue("A & B <HD>");

    await closeSettings(page);
    await expect(page.getByRole("button", { name: marked("inputs.liveTv"), exact: true })).toBeVisible();
    await page.locator("#apps-tab").click();
    await expect(page.locator("#apps-empty")).toHaveText(marked("home.emptyApps"));
    await page.locator("#samsung-home-shortcut").click();
    await expect(page.locator("#toast")).toHaveText(marked("handoff.homeUnavailable"));
    expect(errors).toEqual([]);
  });
}
