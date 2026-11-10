const { test, expect } = require("@playwright/test");
for (const glassSettings of [false, true]) {
  test(`shared category drawer retains navigation when appearance changes from ${glassSettings ? "Glass" : "Classic"}`, async ({
    page,
  }) => {
    await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
    await page.addInitScript((glassSettings) => {
      if (!localStorage.getItem("aerotizen.settings.v1"))
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            glassSettings,
            home: ["demo0"],
            background: "black",
            showWeather: false,
          }),
        );
    }, glassSettings);
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    await expect(page.locator('#home-root [data-focused="true"]')).toHaveCount(1);
    await page.locator("#gear").click();
    await expect(page.locator('#home-root [data-focused="true"]')).toHaveCount(0);
    await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "false");
    await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute("data-key", "section:appearance");
    await page.keyboard.press("ArrowRight");
    await page.locator(`[data-key="settings-appearance:${!glassSettings}"]`).click();
    await expect(page.locator('#editor [data-focused="true"]')).toHaveAttribute(
      "data-key",
      `settings-appearance:${!glassSettings}`,
    );
    await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "true");
    await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute(
      "data-key",
      `settings-appearance:${!glassSettings}`,
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "false");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-section-pane="apps"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    await expect(page.locator('#home-root [data-focused="true"]')).toHaveCount(1);
    await page.reload();
    await page.locator("#gear").click();
    expect(
      await page
        .locator("[data-settings-drawer=frame]")
        .evaluate((node) => getComputedStyle(node).backgroundImage !== "none"),
    ).toBe(!glassSettings);
  });
}
