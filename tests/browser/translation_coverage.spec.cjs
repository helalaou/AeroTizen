const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const english = require("../../launcher/src/shared/i18n/en.json");
const { closeSettings, openCategory } = require("./drawer_helpers.cjs");
const { loadTypeScript } = require("../helpers/load_typescript.cjs");
const { FIXED_NAMES } = loadTypeScript("launcher/src/shared/fixedNames.ts");
const fixedNameValues = [...Object.values(FIXED_NAMES), FIXED_NAMES.appName.toUpperCase()];

const pseudoLanguage = "en-XA";
const pseudoCatalogueName = "Pseudo";
// A language's own name (e.g. "Русский") is never translated, so it must be excepted by
// code rather than hardcoded per language; this stays correct as catalogues are added.
const { catalogues } = loadTypeScript(path.join(__dirname, "../../launcher/src/shared/i18n/catalogues.ts"));
const languageNames = Object.fromEntries(Object.entries(catalogues).map(([code, { name }]) => [code, name]));
languageNames[pseudoLanguage] = pseudoCatalogueName;
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
const inputName = "A & B <HD>";
const installedVersion = readFileSync(path.join(__dirname, "../../launcher/version.txt"), "utf8").trim();
const releaseVersion = Number(installedVersion.split(".")[0]) + 1 + ".0.0";
const releaseNote = "Sample launcher release note";
const symbolise = (text) =>
  text.replace(/\{\{[^}]+\}\}|[\p{L}\p{N}]/gu, (token) => (token.startsWith("{{") ? token : "■"));
const pseudoText = (key) =>
  symbolise(english[key]).replace(/\{\{(\w+)\}\}/g, (token, name) => FIXED_NAMES[name] ?? token);
const devUrl = "http://127.0.0.1:8172/";
const expectTextFits = async (locator) => {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
};

const findUntranslated = (page) =>
  page.evaluate(
    ({ attributes, inputName, releaseNote, languageNames, fixedNameValues }) => {
      const clock = AeroTizen.clock;
      const now = new Date();
      const dates = clock.DATE_FORMATS.map((format) => format.format(now));
      const times = ["12", "24"].map((format) => clock.formatTime(now, format));
      const leftovers = [];
      const inspect = (element, field, value) => {
        let text = value.trim();
        const languageOption = element.closest('[data-key^="language:"]');
        const languageCode = languageOption?.getAttribute("data-key").slice("language:".length);
        if (
          (languageCode && text === languageNames[languageCode]) ||
          (text === releaseNote && element.matches("[data-release-notes] li")) ||
          (text === "aerotizen update launcher" && element.matches("[data-update-command] code")) ||
          (text === "github.com/helalaou/AeroTizen" && element.matches("[data-about-facts] code")) ||
          (dates.includes(text) && element.closest('#date, #date-formats [data-key]:not([data-key="date:none"])'))
        ) {
          return;
        }
        // Scope test data exceptions to the controls that display those values.
        if (element.closest("#inputs, #input-names, #hdmi-keep-visible")) {
          for (const label of [inputName, "Xbox", "PC", "HDMI 1", "HDMI 2", "HDMI 3"]) {
            text = text.replaceAll(label, "");
          }
        }
        if (element.closest("#time, #time-formats")) {
          for (const time of times) text = text.replace(time, "");
        }
        for (const name of fixedNameValues) text = text.replaceAll(name, "");
        if (/\p{L}/u.test(text)) {
          leftovers.push({ target: element.id || element.getAttribute("data-key") || element.tagName, field, value });
        }
      };
      for (const element of document.body.querySelectorAll("*")) {
        if (element.closest("[hidden], script, style") || !element.checkVisibility({ visibilityProperty: true })) {
          continue;
        }
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) inspect(element, "text", node.textContent);
        }
        const hiddenFromAccessibility = element.closest('[aria-hidden="true"]');
        for (const attribute of attributes) {
          if (hiddenFromAccessibility && attribute.startsWith("aria-")) continue;
          const value = element.getAttribute(attribute);
          if (value) inspect(element, attribute, value);
        }
      }
      return leftovers;
    },
    { attributes: textAttributes, inputName, releaseNote, languageNames, fixedNameValues },
  );

const expectTranslatedScreen = async (page, state) => {
  expect(await findUntranslated(page), `Plain text in ${state}`).toEqual([]);
};

test("the production HTML shell contains no untranslated launcher copy", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const rawCopy = await page.evaluate(
    ({ html, textAttributes }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const elements = doc.querySelectorAll(textAttributes.map((name) => "[" + name + "]").join(","));
      return {
        title: doc.title,
        body: doc.body.textContent.trim(),
        attributes: Array.from(elements).flatMap((element) =>
          textAttributes.map((name) => element.getAttribute(name)).filter((value) => value?.trim()),
        ),
      };
    },
    { html: await response.text(), textAttributes },
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
    await page.clock.setFixedTime(new Date("2026-06-10T13:05:00Z"));
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.route("https://api.github.com/repos/helalaou/AeroTizen/releases?*", (route) =>
      route.fulfill({
        json: [{ tag_name: "launcher-v" + releaseVersion, draft: false, prerelease: false, body: "* " + releaseNote }],
      }),
    );
    await page.route("https://geocoding-api.open-meteo.com/**", (route) => route.fulfill({ status: 503 }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ json: {} }));
    const messages = Object.fromEntries(Object.entries(english).map(([key, text]) => [key, symbolise(text)]));
    messages["home.home"] = pseudoText("home.home") + " ■■■■■■■■■■";
    await page.route("**/src/shared/i18n/catalogues.ts*", async (route) => {
      const response = await route.fetch();
      const catalogue = JSON.stringify({ name: pseudoCatalogueName, messages });
      // Inject only into the development response so Pseudo is absent from the shipped bundle.
      await route.fulfill({
        response,
        body: (await response.text()) + "\ncatalogues[" + JSON.stringify(pseudoLanguage) + "] = " + catalogue + ";",
      });
    });
    await page.addInitScript(
      ({ glass, inputName }) => {
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            glassSettings: glass,
            background: "black",
            continueWatching: true,
            inputNames: { "HDMI 1": inputName },
          }),
        );
        window.tizen = { application: { getAppsInfo: (done) => done([]) } };
      },
      { glass: glassSettings, inputName },
    );
    await page.goto(devUrl);
    const homeTab = page.locator("#home-tab");
    await expect(homeTab).toHaveText("Home");
    const englishWidth = await homeTab.evaluate((element) => element.getBoundingClientRect().width);
    await page.locator("#gear").click();
    await openCategory(page, "language");
    const languageOption = (key) => page.locator(`#language [data-key="${key}"]`);
    const pseudoKey = `language:${pseudoLanguage}`;
    const pseudo = languageOption(pseudoKey);
    await expect(languageOption("language:auto")).toBeFocused();
    await expect(pseudo).toHaveAccessibleName(pseudoCatalogueName);
    const pseudoRow = await pseudo.evaluate((option) => option.offsetTop);
    const languageOptions = await page
      .locator('#language [data-key^="language:"]')
      .evaluateAll((options) => options.map((option) => ({ key: option.dataset.key, row: option.offsetTop })));
    const optionsThroughPseudo = languageOptions.slice(
      0,
      languageOptions.findIndex(({ key }) => key === pseudoKey) + 1,
    );
    // Move down the first column when options wrap, then right along the target row.
    const rowStarts = optionsThroughPseudo.filter(
      ({ row }, index) => index > 0 && row !== optionsThroughPseudo[index - 1].row,
    );
    for (const { key } of rowStarts) {
      await page.keyboard.press("ArrowDown");
      await expect(languageOption(key)).toBeFocused();
    }
    for (const { key } of optionsThroughPseudo.filter(({ row }) => row === pseudoRow).slice(1)) {
      await page.keyboard.press("ArrowRight");
      await expect(languageOption(key)).toBeFocused();
    }
    await expect(pseudo).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(pseudo).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("lang", pseudoLanguage);
    await expect(homeTab).toHaveText(messages["home.home"]);
    const translatedWidth = await homeTab.evaluate((element) => element.getBoundingClientRect().width);
    expect(translatedWidth).toBeGreaterThan(englishWidth);
    await expect
      .poll(() => page.locator("[data-header-focus=tabs]").evaluate((element) => parseFloat(element.style.width)))
      .toBeCloseTo(translatedWidth);
    await expectTextFits(homeTab);
    await expectTextFits(page.locator('[data-key="language:auto"]'));
    await expect(page.locator("[data-settings-title]")).toHaveText(pseudoText("settings.language.title"));

    await expectTranslatedScreen(page, "Language");

    if (!glassSettings) {
      await page.evaluate(() => {
        const probe = document.createElement("button");
        probe.id = "translation-probe";
        probe.textContent = "Hardcoded label";
        probe.setAttribute("aria-label", "Hardcoded accessible name");
        document.body.append(probe);
      });
      expect(await findUntranslated(page)).toEqual([
        { target: "translation-probe", field: "text", value: "Hardcoded label" },
        { target: "translation-probe", field: "aria-label", value: "Hardcoded accessible name" },
      ]);
      await page.locator("#translation-probe").evaluate((element) => element.remove());
    }

    const visit = async (pane, messageKey, selector) => {
      await page.keyboard.press("Escape");
      await openCategory(page, pane);
      const section = page.locator(`[data-section-pane="${pane}"]`);
      const label = selector ? section.locator(selector) : section.getByText(pseudoText(messageKey), { exact: true });
      await expect(label).toHaveText(pseudoText(messageKey));
      await expectTextFits(label);
      await expectTranslatedScreen(page, pane);
    };
    await visit("appearance", "appearance.title");
    await visit("apps", "continue.tvOnly");
    await visit("wallpaper", "scene.black", '[data-key="bg:black"] [data-wallpaper-label]');
    await page.locator('[data-key="bg:custom"]').click();
    await expect(page.locator("[data-colour-picker]")).toBeVisible();
    await expectTranslatedScreen(page, "custom colour picker");
    await expectTextFits(page.locator("#colour-picker-title"));
    await page.keyboard.press("Escape");
    for (const group of ["photo", "gradient", "animated"]) {
      await page.locator(`[data-key="wallpaper-categories:${group}"]`).click();
      await expectTranslatedScreen(page, `wallpaper ${group}`);
      if (group === "gradient") {
        await page.locator('[data-key="bg:custom-gradient"]').click();
        await expect(page.locator("[data-colour-picker]")).toBeVisible();
        await expectTranslatedScreen(page, "custom gradient picker");
        await expectTextFits(page.locator("#colour-picker-title"));
        await page.keyboard.press("Escape");
      }
    }
    await visit("status", "clock.layout");
    await visit(
      "weather",
      "weather.homeDisplay",
      `[data-settings-heading-title]:text-is("${pseudoText("weather.homeDisplay")}")`,
    );
    await page.locator('[data-key="weather:change"]').click();
    const search = page.getByPlaceholder(pseudoText("weather.searchPlaceholder"));
    await expect(search).toHaveAccessibleName(pseudoText("weather.locationLabel"));
    await page.locator('[data-key="weather:search"]').click();
    await expect(page.locator("#weather-search-status")).toHaveText(pseudoText("weather.searchTooShort"));
    await expectTranslatedScreen(page, "weather search validation");
    await search.fill("London");
    await page.locator('[data-key="weather:search"]').click();
    await expect(page.locator("#weather-search-status")).toHaveText(pseudoText("weather.searchFailed"));
    await expectTranslatedScreen(page, "weather search failure");
    await visit("sources", "inputs.keepVisible");
    const input = page.getByRole("textbox", { name: pseudoText("inputs.nameLabel").replace("{{port}}", "HDMI 1") });
    await expect(input).toHaveValue(inputName);

    await page.keyboard.press("Escape");
    await openCategory(page, "about");
    const about = page.locator('[data-section-pane="about"]');
    await expect(about.locator("[data-release-notes] li")).toHaveText(releaseNote);
    await expect(about.getByRole("heading", { name: pseudoText("settings.about.whatsNew") })).toBeVisible();
    await expect(about.locator("[data-update-command]")).toContainText(pseudoText("settings.about.runOnComputer"));
    await expectTranslatedScreen(page, "About");

    await closeSettings(page);
    await expect(page.getByRole("button", { name: pseudoText("inputs.liveTv"), exact: true })).toBeVisible();
    await expectTranslatedScreen(page, "Home");
    await page.locator("#apps-tab").click();
    await expect(page.locator("#apps-empty")).toHaveText(pseudoText("home.emptyApps"));
    const backToTop = page.getByRole("button", { name: pseudoText("home.backToTop") });
    await expect(backToTop).toHaveCount(0);
    await page.locator("#samsung-home-shortcut").click();
    await expect(page.locator("#toast")).toHaveText(pseudoText("handoff.homeUnavailable"));
    await expectTranslatedScreen(page, "empty app list and Samsung Home error");
    await page.evaluate(() => {
      AeroTizen.tizen.application.getAppsInfo = (done) =>
        done([{ id: "sampleapp1.App", packageId: "sampleapp1", name: "■■■" }]);
      AeroTizen.apps.load(() => {});
    });
    await expect(backToTop).toBeVisible();
    await expect(backToTop).toHaveAttribute("title", pseudoText("home.backToTop"));
    await expectTranslatedScreen(page, "populated app list");
    expect(errors).toEqual([]);
  });
}
