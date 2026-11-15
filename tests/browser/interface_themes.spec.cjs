const { test, expect } = require("./launcher_fixture.cjs");

const APPEARANCE_CHOICES = '[data-key^="settings-appearance:"]';
const TILE = "#grid > [data-id]:nth-child(2)";
const TAB = "#home-tab";
const LATIN_AND_ARABIC_SAMPLE = "Aب";
const CLASSIC_TILE_RADIUS = "10px";
const BUILT_IN_NAMES = ["Classic", "Glass"];
const THEMES = [
  {
    id: "gloss",
    tileRadius: "56px",
    fonts: ["Google Sans"],
    names: { en: "Gloss", fr: "Brillance", it: "Lucido", ru: "Глянец", ar: "لمعان", "pt-BR": "Brilho" },
  },
];
const LANGUAGES = Object.keys(THEMES[0].names);

const choice = (theme) => `[data-key="settings-appearance:${theme}"]`;

const open = async (page, settings) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript((settings) => {
    if (localStorage.getItem("aerotizen.settings.v1")) return;
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({ home: ["demo0", "demo1", "demo2"], background: "black", showWeather: false, ...settings }),
    );
  }, settings);
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => {
    const inputs = AeroTizen.inputs.getSnapshot();
    const sources = [{ type: "HDMI", number: 1, connected: true }];
    AeroTizen.inputs.getSnapshot = () => ({ ...inputs, sources, visibleSources: sources });
    AeroTizen.homeScreen.refreshApps();
  });
};

const openAppearance = async (page) => {
  await page.locator("#gear").click();
  await page.locator('[data-key="section:appearance"]').click();
  await expect(page.locator(choice("classic"))).toBeVisible();
};

const tileRadius = (page) => page.locator(TILE).evaluate((tile) => getComputedStyle(tile).borderTopLeftRadius);

const savedTheme = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aerotizen.settings.v1")).theme);

const tabFont = (page) =>
  page.locator(TAB).evaluate((tab) => getComputedStyle(tab).fontFamily.split(",")[0].replace(/"/g, "").trim());

const fontLoads = (page, font) =>
  page.evaluate(
    ([font, sample]) =>
      document.fonts.load(`16px "${font}"`, sample).then(
        (faces) => faces.length > 0,
        () => false,
      ),
    [font, LATIN_AND_ARABIC_SAMPLE],
  );

test("Appearance lists the themes after Classic and Glass", async ({ page }) => {
  await open(page, { theme: "classic", language: "en" });
  await openAppearance(page);
  await expect(page.locator(APPEARANCE_CHOICES)).toHaveText([
    ...BUILT_IN_NAMES,
    ...THEMES.map((theme) => theme.names.en),
  ]);
});

for (const theme of THEMES) {
  test(`${theme.names.en} restyles Home on the Glass layout with its fonts and survives a restart`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page, { theme: "classic", language: "en" });
    await expect.poll(() => tileRadius(page)).toBe(CLASSIC_TILE_RADIUS);
    await openAppearance(page);
    await page.locator(choice(theme.id)).click();
    await expect(page.locator(choice(theme.id))).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("body")).toHaveAttribute("data-theme", theme.id);
    await expect(page.locator("[data-input-dock]")).toHaveAttribute("data-variant", "glass");
    await expect(page.locator("[data-input-card]")).toHaveAttribute("data-variant", "glass");
    await expect(page.locator('[data-input-part="status"]')).toHaveCount(1);
    await expect.poll(() => tileRadius(page)).toBe(theme.tileRadius);
    await expect.poll(() => tabFont(page)).toBe(theme.fonts[0]);
    for (const font of theme.fonts) expect(await fontLoads(page, font), font).toBe(true);
    expect(await savedTheme(page)).toBe(theme.id);
    await page.reload();
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    await expect(page.locator("body")).toHaveAttribute("data-theme", theme.id);
    await expect.poll(() => tileRadius(page)).toBe(theme.tileRadius);
    await openAppearance(page);
    await page.locator(choice("classic")).click();
    await expect(page.locator("body")).toHaveAttribute("data-theme", "classic");
    await expect.poll(() => tileRadius(page)).toBe(CLASSIC_TILE_RADIUS);
    expect(errors).toEqual([]);
  });

  test(`${theme.names.en} tab plate keeps the size of its tab when the theme changes the font`, async ({ page }) => {
    const appsTab = page.locator("#apps-tab");
    const plateAgainstTab = () =>
      page.evaluate(() => {
        const tab = document.querySelector("#apps-tab").getBoundingClientRect();
        const plate = document.querySelector("[data-header-focus=tabs]").getBoundingClientRect();
        return [plate.left - tab.left, plate.width - tab.width].map(Math.round);
      });
    await open(page, { theme: "glass", language: "ru" });
    await appsTab.click();
    await expect.poll(plateAgainstTab).toEqual([0, 0]);
    const glassWidth = (await appsTab.boundingBox()).width;
    await openAppearance(page);
    await page.locator(choice(theme.id)).click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect.poll(() => tabFont(page)).toBe(theme.fonts[0]);
    await expect.poll(async () => (await appsTab.boundingBox()).width).not.toBe(glassWidth);
    await expect.poll(plateAgainstTab).toEqual([0, 0]);
  });
}

for (const language of LANGUAGES) {
  test(`${language} names every theme`, async ({ page }) => {
    await open(page, { theme: "glass", language });
    await openAppearance(page);
    for (const theme of THEMES) await expect(page.locator(choice(theme.id))).toHaveText(theme.names[language]);
  });
}
