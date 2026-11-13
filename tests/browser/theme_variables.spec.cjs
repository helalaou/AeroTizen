const { test, expect } = require("./launcher_fixture.cjs");

const RADIUS = "border-top-left-radius";
const UI_FONT = "SamsungOne, Roboto, Arial, sans-serif";
const PAGE_FONT = 'Roboto, SamsungOne, "Helvetica Neue", Arial, sans-serif';
const THEME_FONT = '"Theme Sans", serif';
const WHITE = "rgb(255, 255, 255)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const THEME_COLOUR = "rgb(1, 2, 3)";
const SHADOW = "0 0 0 3px rgb(255, 0, 0)";
const THEME_SHADOW = "rgb(255, 0, 0) 0px 0px 0px 3px";
const TEXT_SHADOW = "0 0 3px rgb(255, 0, 0)";
const THEME_TEXT_SHADOW = "rgb(255, 0, 0) 0px 0px 3px";
const GRADIENT = "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))";
const GLASS_PLATE_SHADOW = "rgba(255, 255, 255, 0.2) 0px 1px 0px 0px inset";
const FOCUS_COLOUR = { classic: "rgb(124, 92, 255)", glass: "rgb(237, 242, 255)" };
const TILE = "#grid > [data-id]:nth-child(2)";
const FOCUSED_TILE = '#grid > [data-id][data-focused="true"]';
const MOVING_TILE = '#grid > [data-id][data-moving="true"]';
const CONTINUE_CARD = "#continue-items [data-key]";
const FOCUSED_CONTINUE_CARD = '#continue-items [data-key][data-focused="true"]';
const CONTINUE_ARTWORK = '[data-continue-part="artwork"]';
const CONTINUE_BADGE = '[data-continue-part="source-badge"]';
const CONTINUE_TITLE = '[data-continue-part="title"]';
const CONNECTED_INPUT = '[data-input-card]:not([data-disconnected="true"])';
const EMPTY_INPUT = '[data-input-card][data-disconnected="true"]';
const FOCUSED_INPUT = '[data-input-card][data-focused="true"]';
const INPUT_LABEL = `${CONNECTED_INPUT} [data-input-part="label"]`;
const INPUT_SUBTITLE = `${CONNECTED_INPUT} [data-input-part="subtitle"]`;
const INPUT_ICON = `${CONNECTED_INPUT} [data-input-part="icon"]`;
const INPUT_STATUS = `${CONNECTED_INPUT} [data-input-part="status"]`;
const APP_NAME = "#grid [data-app-fallback] > div";
const HEADING = "[data-home-section-heading]";
const TAB_PLATE = '[data-header-focus="tabs"]';
const APP_ROW = "#grid >> xpath=..";
const SETTINGS_FRAME = '[data-settings-drawer="frame"]';
const SETTINGS_SIDEBAR = '[data-settings-drawer="sidebar"]';
const SETTINGS_SCROLL = '[data-settings-drawer="scroll"]';
const SIDEBAR_TITLE = `${SETTINGS_SIDEBAR} h2`;
const PANE_TITLE = "[data-settings-title]";
const SECTION_TITLE = '[data-settings-heading="section"] [data-settings-heading-title]';
const SELECTED_CHOICE = '[data-key^="settings-appearance:"][aria-pressed="true"]';
const CATEGORY_ICON = '[data-key="section:about"] > span';
const STORE_LABEL = '[data-key="add"] > div';

const HOME_VARIABLES = [
  ["--home-card-radius", "56px", TILE, RADIUS, "10px", "56px"],
  ["--home-card-shadow", SHADOW, TILE, "box-shadow", "none", THEME_SHADOW],
  ["--home-card-sheen", GRADIENT, TILE, "background-image", "none", GRADIENT, { pseudo: "::after" }],
  [
    "--home-card-focus-transform",
    "scale(1.2)",
    FOCUSED_TILE,
    "transform",
    "matrix(1.035, 0, 0, 1.035, 0, 0)",
    "matrix(1.2, 0, 0, 1.2, 0, 0)",
  ],
  ["--continue-card-radius", "28px", CONTINUE_CARD, RADIUS, "10px", "28px"],
  ["--continue-badge-radius", "16px", CONTINUE_BADGE, RADIUS, "7px", "16px"],
  ["--continue-title-weight", "600", CONTINUE_TITLE, "font-weight", "500", "600"],
  ["--continue-title-text", THEME_COLOUR, CONTINUE_TITLE, "color", WHITE, THEME_COLOUR],
  ["--continue-artwork-mark", GRADIENT, CONTINUE_ARTWORK, "background-image", "none", GRADIENT, { pseudo: "::after" }],
  [
    "--continue-artwork-mark-shadow",
    SHADOW,
    CONTINUE_ARTWORK,
    "box-shadow",
    "none",
    THEME_SHADOW,
    { pseudo: "::after" },
  ],
  ["--input-card-radius", "24px", CONNECTED_INPUT, RADIUS, "27px", "24px", { only: "glass" }],
  ["--input-dock-radius", "22px", "[data-input-dock]", RADIUS, "37px", "22px", { only: "glass" }],
  ["--input-empty-opacity", "0.5", EMPTY_INPUT, "opacity", "0.37", "0.5", { only: "glass" }],
  ["--input-connected-text", THEME_COLOUR, INPUT_LABEL, "color", WHITE, THEME_COLOUR, { only: "glass" }],
  ["--input-connected-icon-text", THEME_COLOUR, INPUT_ICON, "color", WHITE, THEME_COLOUR, { only: "glass" }],
  [
    "--input-connected-subtitle-text",
    THEME_COLOUR,
    INPUT_SUBTITLE,
    "color",
    "rgba(255, 255, 255, 0.83)",
    THEME_COLOUR,
    { only: "glass" },
  ],
  ["--app-label-weight", "600", INPUT_LABEL, "font-weight", "500", "600"],
  ["--app-label-weight", "600", APP_NAME, "font-weight", "500", "600"],
  ["--font-ui", THEME_FONT, "body", "font-family", PAGE_FONT, THEME_FONT],
  ["--font-ui", THEME_FONT, "#home-tab", "font-family", UI_FONT, THEME_FONT],
  ["--font-ui", THEME_FONT, HEADING, "font-family", UI_FONT, THEME_FONT],
  ["--font-ui", THEME_FONT, INPUT_LABEL, "font-family", UI_FONT, THEME_FONT, { only: "glass" }],
  ["--font-ui", THEME_FONT, INPUT_STATUS, "font-family", UI_FONT, THEME_FONT, { only: "glass" }],
  ["--header-icon-text", THEME_COLOUR, "#gear", "color", WHITE, THEME_COLOUR],
  ["--header-icon-surface", THEME_COLOUR, "#gear", "background-color", TRANSPARENT, THEME_COLOUR],
  ["--header-icon-shadow", SHADOW, "#gear", "box-shadow", "none", THEME_SHADOW],
  ["--header-icon-text", THEME_COLOUR, "#network", "color", WHITE, THEME_COLOUR],
  ["--header-icon-surface", THEME_COLOUR, "#network", "background-color", TRANSPARENT, THEME_COLOUR],
  ["--header-icon-shadow", SHADOW, "#network", "box-shadow", "none", THEME_SHADOW],
  ["--header-status-shadow", TEXT_SHADOW, "[data-header-status]", "text-shadow", "none", THEME_TEXT_SHADOW],
  [
    "--header-status-divider",
    THEME_COLOUR,
    "#time",
    "background-color",
    TRANSPARENT,
    THEME_COLOUR,
    { pseudo: "::before" },
  ],
  ["--header-tab-radius", "24px", "[data-header-tabs]", RADIUS, "28px", "24px"],
  ["--header-tab-weight", "600", "#home-tab", "font-weight", "500", "600"],
  ["--header-tab-plate-radius", "17px", "#home-tab", RADIUS, "20px", "17px"],
  ["--header-tab-plate-radius", "17px", TAB_PLATE, RADIUS, "19px", "16px"],
  ["--header-tab-plate-surface", GRADIENT, TAB_PLATE, "background-image", "none", GRADIENT],
  [
    "--header-tab-plate-shadow",
    SHADOW,
    TAB_PLATE,
    "box-shadow",
    { classic: "none", glass: GLASS_PLATE_SHADOW },
    THEME_SHADOW,
  ],
  ["--header-tab-plate-text", THEME_COLOUR, "#home-tab", "color", WHITE, THEME_COLOUR],
  ["--header-tab-underline", GRADIENT, TAB_PLATE, "background-image", "none", GRADIENT, { pseudo: "::after" }],
  ["--header-tab-underline-shadow", SHADOW, TAB_PLATE, "box-shadow", "none", THEME_SHADOW, { pseudo: "::after" }],
  ["--home-section-heading-weight", "600", HEADING, "font-weight", "500", "600"],
  ["--home-section-heading-tracking", "1.5px", HEADING, "letter-spacing", "2.5px", "1.5px"],
  ["--clock-date-weight", "300", "#date", "font-weight", "400", "300"],
  ["--clock-time-weight", "600", "#time", "font-weight", "700", "600"],
  ["--toast-radius", "24px", "#toast", RADIUS, "12px", "24px"],
  ["--toast-shadow", SHADOW, "#toast", "box-shadow", "none", THEME_SHADOW],
  ["--toast-text", THEME_COLOUR, "#toast", "color", WHITE, THEME_COLOUR],
];

const FOCUSED_CONTINUE_VARIABLES = [
  [
    "--continue-focus-label-surface",
    THEME_COLOUR,
    `${FOCUSED_CONTINUE_CARD} [data-continue-part="label"]`,
    "background-color",
    { classic: TRANSPARENT, glass: "rgba(18, 25, 38, 0.38)" },
    THEME_COLOUR,
  ],
  [
    "--continue-focus-title-text",
    THEME_COLOUR,
    `${FOCUSED_CONTINUE_CARD} ${CONTINUE_TITLE}`,
    "color",
    WHITE,
    THEME_COLOUR,
  ],
  [
    "--continue-focus-episode-text",
    THEME_COLOUR,
    `${FOCUSED_CONTINUE_CARD} [data-continue-part="episode"]`,
    "color",
    { classic: "rgb(204, 204, 204)", glass: "rgb(213, 222, 236)" },
    THEME_COLOUR,
  ],
];

const FOCUSED_INPUT_VARIABLES = [
  [
    "--input-focus-icon-text",
    THEME_COLOUR,
    `${FOCUSED_INPUT} [data-input-part="icon"]`,
    "color",
    WHITE,
    THEME_COLOUR,
    { only: "glass" },
  ],
];

const FOCUSED_TAB_VARIABLES = [
  ["--header-tab-focus-shadow", TEXT_SHADOW, "#home-tab", "text-shadow", "none", THEME_TEXT_SHADOW],
  ["--header-tab-plate-border", THEME_COLOUR, TAB_PLATE, "border-top-color", FOCUS_COLOUR, THEME_COLOUR],
  ["--header-tab-plate-text", THEME_COLOUR, "#home-tab", "color", WHITE, THEME_COLOUR],
];

const SCROLLING_ROW_VARIABLES = [
  ["--home-row-clearance", "96px", APP_ROW, "padding-top", "32px", "96px"],
  ["--home-row-clearance", "96px", APP_ROW, "margin-top", "-32px", "-96px"],
];

const SETTINGS_VARIABLES = [
  ["--font-ui", THEME_FONT, SETTINGS_FRAME, "font-family", UI_FONT, THEME_FONT],
  ["--settings-sidebar-line-height", "30px", SETTINGS_SIDEBAR, "line-height", "normal", "30px"],
  ["--settings-scroll-ring-room", "2px", SETTINGS_SCROLL, "padding-left", "4px", "6px"],
  ["--settings-scroll-ring-room", "2px", SETTINGS_SCROLL, "margin-left", "0px", "-2px"],
  ["--settings-title-transform", "uppercase", PANE_TITLE, "text-transform", "none", "uppercase"],
  ["--settings-title-tracking", "3px", PANE_TITLE, "letter-spacing", "normal", "3px"],
  ["--settings-title-transform", "uppercase", SIDEBAR_TITLE, "text-transform", "none", "uppercase"],
  ["--settings-title-tracking", "3px", SIDEBAR_TITLE, "letter-spacing", "normal", "3px"],
  ["--settings-title-transform", "uppercase", SECTION_TITLE, "text-transform", "none", "none"],
  ["--settings-title-tracking", "3px", SECTION_TITLE, "letter-spacing", "normal", "normal"],
  ["--settings-category-icon", THEME_COLOUR, CATEGORY_ICON, "color", "rgba(243, 246, 255, 0.79)", THEME_COLOUR],
  ["--settings-return-label-wrap", "nowrap", "#escape strong", "white-space", "normal", "nowrap"],
  ["--choice-selected-text", THEME_COLOUR, SELECTED_CHOICE, "color", WHITE, THEME_COLOUR],
];

const APPS_PANE_VARIABLES = [
  ["--settings-store-label-shadow", "none", STORE_LABEL, "text-shadow", "rgba(0, 0, 0, 0.35) 0px 2px 8px", "none"],
  ["--settings-store-subtitle-text", THEME_COLOUR, `${STORE_LABEL} > div`, "color", "rgb(184, 184, 192)", THEME_COLOUR],
];

const computed = (page, target, property, pseudo = null) =>
  page
    .locator(target)
    .first()
    .evaluate(
      (node, [property, pseudo]) => getComputedStyle(node, pseudo).getPropertyValue(property),
      [property, pseudo],
    );

const setThemeVariable = (page, variable, value) =>
  page.evaluate(([variable, value]) => document.body.style.setProperty(variable, value), [variable, value]);

const clearThemeVariable = (page, variable) =>
  page.evaluate((variable) => document.body.style.removeProperty(variable), variable);

const expectVariables = async (page, theme, variables) => {
  for (const [variable, value, target, property, ownValue, themed, { pseudo, only } = {}] of variables) {
    if (only && only !== theme) continue;
    const label = `${variable} for ${property} of ${target}${pseudo || ""}`;
    const initial = typeof ownValue === "string" ? ownValue : ownValue[theme];
    await expect.poll(() => computed(page, target, property, pseudo), label + ", no theme value").toBe(initial);
    await setThemeVariable(page, variable, value);
    await expect.poll(() => computed(page, target, property, pseudo), label + ", theme value").toBe(themed);
    await clearThemeVariable(page, variable);
    await expect.poll(() => computed(page, target, property, pseudo), label + ", theme value removed").toBe(initial);
  }
};

const openHome = async (page, theme) => {
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(
    (theme) =>
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          theme,
          home: ["demo0", "demo1", "demo2", "demo3", "demo4", "demo5"],
          homeCardColumns: 3,
          background: "black",
          showWeather: false,
          continueWatching: true,
          language: "en",
          inputNames: { "HDMI 1": "Console" },
        }),
      ),
    theme,
  );
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  await page.evaluate(() => {
    const continueWatching = AeroTizen.continueWatching.getSnapshot();
    const items = [
      {
        key: "variables-fixture",
        title: "Variables fixture",
        sourceName: "YouTube",
        sourceId: "demo0",
        season: 1,
        episode: 1,
        duration: 300,
        playback: 75,
      },
    ];
    const inputs = AeroTizen.inputs.getSnapshot();
    const sources = [
      { type: "HDMI", number: 1, connected: true },
      { type: "HDMI", number: 2, connected: false },
    ];
    AeroTizen.inputs.getSnapshot = () => ({ ...inputs, sources, visibleSources: sources });
    AeroTizen.continueWatching.getSnapshot = () => ({ ...continueWatching, items });
    AeroTizen.homeScreen.refreshApps();
  });
  await expect(page.locator(FOCUSED_TILE)).toHaveCount(1);
};

const moveFocusTo = async (page, key, target) => {
  await expect(async () => {
    if (!(await page.locator(target).count())) await page.keyboard.press(key);
    await expect(page.locator(target)).toHaveCount(1, { timeout: 500 });
  }).toPass();
};

const showAppsInScrollingRow = async (page, scrolling) => {
  await page.evaluate((homeAppLayout) => AeroTizen.settings.update({ homeAppLayout }), scrolling ? "scroll" : "grid");
  await expect(page.locator("#grid")).toHaveAttribute("data-scroll", String(scrolling));
};

for (const theme of ["classic", "glass"]) {
  test(`${theme} Home keeps its look until a theme sets a variable`, async ({ page }) => {
    await openHome(page, theme);
    await expectVariables(page, theme, HOME_VARIABLES);
    await moveFocusTo(page, "ArrowDown", FOCUSED_CONTINUE_CARD);
    await expectVariables(page, theme, FOCUSED_CONTINUE_VARIABLES);
    await moveFocusTo(page, "ArrowDown", FOCUSED_INPUT);
    await expectVariables(page, theme, FOCUSED_INPUT_VARIABLES);
    await moveFocusTo(page, "ArrowUp", '#home-tab[data-focused="true"]');
    await expectVariables(page, theme, FOCUSED_TAB_VARIABLES);
    await showAppsInScrollingRow(page, true);
    await expectVariables(page, theme, SCROLLING_ROW_VARIABLES);
  });

  test(`${theme} Settings keeps its look until a theme sets a variable`, async ({ page }) => {
    await openHome(page, theme);
    await page.locator("#gear").click();
    await page.locator('[data-key="section:appearance"]').click();
    await expect(page.locator(SETTINGS_SCROLL)).toBeVisible();
    await expectVariables(page, theme, SETTINGS_VARIABLES);
    await page.locator('[data-key="section:apps"]').click();
    await expect(page.locator(STORE_LABEL)).toBeVisible();
    await expectVariables(page, theme, APPS_PANE_VARIABLES);
  });

  test(`${theme} tiles under the header can lower their focus shadow, other tiles keep theirs`, async ({ page }) => {
    await openHome(page, theme);
    const tiles = page.locator("#grid > [data-id]");
    const focusShadow = () => computed(page, FOCUSED_TILE, "box-shadow");
    const sharedFocusShadow = await focusShadow();
    await setThemeVariable(page, "--home-card-focus-shadow-top", SHADOW);
    await expect.poll(focusShadow, "first row").toBe(THEME_SHADOW);
    await page.keyboard.press("ArrowDown");
    await expect(tiles.nth(3)).toHaveAttribute("data-focused", "true");
    await expect.poll(focusShadow, "second row").toBe(sharedFocusShadow);
    await showAppsInScrollingRow(page, true);
    await expect.poll(focusShadow, "scrolling row").toBe(THEME_SHADOW);
    await showAppsInScrollingRow(page, false);
    await page.keyboard.press("ArrowUp");
    await expect(tiles.first()).toHaveAttribute("data-focused", "true");
    await setThemeVariable(page, "--home-card-move-shadow", "0 0 0 5px rgb(0, 0, 255)");
    await page.keyboard.down("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.up("Enter");
    await page.keyboard.press("Enter");
    await expect(tiles.first()).toHaveAttribute("data-moving", "true");
    await expect.poll(() => computed(page, MOVING_TILE, "box-shadow"), "moving").toBe("rgb(0, 0, 255) 0px 0px 0px 5px");
  });
}
