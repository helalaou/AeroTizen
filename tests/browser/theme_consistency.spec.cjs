const { test, expect } = require("@playwright/test");
for (const glassSettings of [false, true]) {
  test(`${glassSettings ? "Glass" : "Classic"} theme covers Home, inputs, Continue Watching and uniform Settings choices`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
    await page.addInitScript(
      (glassSettings) =>
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            glassSettings,
            home: ["demo0", "demo1"],
            background: "black",
            showWeather: false,
            continueWatching: true,
          }),
        ),
      glassSettings,
    );
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.ready);
    await page.evaluate(() => {
      AeroTizen.continueWatching.items = [
        {
          key: "theme-fixture",
          title: "Theme fixture",
          sourceName: "YouTube",
          sourceId: "demo0",
          season: 1,
          episode: 1,
          duration: 300,
          playback: 75,
        },
      ];
      AeroTizen.inputs.sources = [{ type: "HDMI", number: 1, connected: true }];
      AeroTizen.homeScreen.refreshApps();
    });
    const homeLayout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      return {
        gridGap: rect("#continue-section h2").top - rect("#grid").bottom,
        continueGap: rect("#inputs-section h2").top - rect("#continue-items").bottom,
      };
    });
    expect(homeLayout).toEqual({ gridGap: 40, continueGap: 40 });
    const headings = page.locator(".home-section-heading");
    await expect(headings).toHaveCount(2);
    for (const heading of await headings.all()) {
      await expect(heading).toHaveCSS("font-size", "21px");
      await expect(heading).toHaveCSS("text-transform", "uppercase");
    }
    const colour = glassSettings ? "rgb(237, 242, 255)" : "rgb(124, 92, 255)";
    expect(await page.locator("#grid .tile.focused").evaluate((n) => getComputedStyle(n).boxShadow)).toContain(colour);
    await page.keyboard.down("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.up("Enter");
    expect(
      await page.locator(".app-actions-menu__focus-indicator").evaluate((n) => getComputedStyle(n).borderColor),
    ).toBe(colour);
    expect(await page.getByRole("menu").evaluate((n) => getComputedStyle(n).backgroundImage === "none")).toBe(
      !glassSettings,
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".continue-card")).toHaveClass(/focused/);
    expect(await page.locator(".continue-card").evaluate((n) => getComputedStyle(n).boxShadow)).toContain(colour);
    expect(await page.locator(".continue-progress-fill").evaluate((n) => getComputedStyle(n).backgroundColor)).toBe(
      colour,
    );
    expect(await page.locator(".continue-card").evaluate((n) => getComputedStyle(n).backgroundImage)).toBe(
      glassSettings ? "linear-gradient(160deg, rgba(86, 97, 116, 0.84), rgba(22, 29, 42, 0.94))" : "none",
    );
    await page.keyboard.press("ArrowDown");
    const source = page.locator("#inputs .focused");
    await expect(source).toHaveCount(1);
    expect(
      await source.evaluate((n) => getComputedStyle(n).boxShadow + " " + getComputedStyle(n).borderColor),
    ).toContain(glassSettings ? "255, 255, 255" : "124, 92, 255");
    await page.locator("#gear").click();
    await page.locator('[data-key="section:appearance"]').click();
    const choices = await page.locator('[data-section-pane="appearance"] .pill.unit').evaluateAll((nodes) =>
      nodes
        .filter((n) => n.getBoundingClientRect().height)
        .map((n) => ({
          height: n.getBoundingClientRect().height,
          font: getComputedStyle(n).fontSize,
          minWidth: getComputedStyle(n).minWidth,
        })),
    );
    expect(choices.length).toBeGreaterThan(3);
    for (const choice of choices) {
      expect(choice.height).toBe(72);
      expect(choice.font).toBe("20px");
      expect(choice.minWidth).toBe("160px");
    }
    await page.screenshot({ path: info.outputPath("settings-control-scale.png") });
    await page.locator('[data-key="section:status"]').click();
    const compact = page.locator('[data-key="clock-layouts:classic"]');
    const vertical = page.locator('[data-key="clock-layouts:vertical"]');
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    await expect(vertical).toHaveAttribute("aria-pressed", "false");
    const unselectedFill = await vertical.evaluate((n) => getComputedStyle(n).backgroundColor);
    await expect(compact).not.toHaveCSS("background-color", unselectedFill);
    await vertical.click();
    await expect(vertical).toHaveAttribute("aria-pressed", "true");
    await expect(compact).toHaveAttribute("aria-pressed", "false");
    await expect(vertical).not.toHaveCSS("background-color", unselectedFill);
    await expect(page.locator("#clock-layouts .selection-indicator")).toHaveCount(0);
    const statusChoices = await page.locator('[data-section-pane="status"] .pill.unit').evaluateAll((nodes) =>
      nodes
        .filter((n) => n.getBoundingClientRect().height)
        .map((n) => ({
          height: n.getBoundingClientRect().height,
          font: getComputedStyle(n).fontSize,
        })),
    );
    for (const choice of statusChoices) {
      expect(choice.height).toBe(72);
      expect(choice.font).toBe("20px");
    }
    await page.screenshot({ path: info.outputPath("status-control-scale.png") });
    await page.locator('[data-key="section:apps"]').click();
    const appsGap = await page
      .locator("#all-apps")
      .evaluate(
        (grid) =>
          document.querySelector('[aria-label="Continue Watching settings"] h3').getBoundingClientRect().top -
          grid.getBoundingClientRect().bottom,
      );
    expect(appsGap).toBe(30);
    const icons = await page
      .locator("#all-apps > .tile")
      .evaluateAll((nodes) => nodes.map((n) => [n.offsetWidth, n.offsetHeight]));
    for (const size of icons) expect(size).toEqual([160, 160]);
    await page.screenshot({ path: info.outputPath("settings-standard-icons.png") });
    await page.locator('[data-key="section:sources"]').click();
    const short = page.locator('[data-key="live-tv-visibility:true"]');
    const wrapped = page.locator('[data-key="hdmi-keep:1:true"]');
    await expect(short).toHaveCSS("height", "72px");
    await expect(wrapped).toHaveCSS("height", "72px");
    await expect(wrapped.locator("span")).toHaveCSS("height", "48px");
    expect(errors).toEqual([]);
  });
}
