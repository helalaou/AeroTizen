const { test, expect } = require("./launcher_fixture.cjs");
for (const theme of ["classic", "glass"]) {
  test(`shared category drawer retains navigation when appearance changes from ${theme}`, async ({ page }) => {
    await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
    await page.addInitScript((theme) => {
      if (!localStorage.getItem("aerotizen.settings.v1"))
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            theme,
            home: ["demo0"],
            background: "black",
            showWeather: false,
          }),
        );
    }, theme);
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    await expect(page.locator('#home-root [data-focused="true"]')).toHaveCount(1);
    await page.locator("#gear").click();
    await expect(page.locator('#home-root [data-focused="true"]')).toHaveCount(0);
    await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "false");
    await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute("data-key", "section:appearance");
    await page.keyboard.press("ArrowRight");
    const otherTheme = theme === "glass" ? "classic" : "glass";
    await page.locator(`[data-key="settings-appearance:${otherTheme}"]`).click();
    await expect(page.locator('#editor [data-focused="true"]')).toHaveAttribute(
      "data-key",
      `settings-appearance:${otherTheme}`,
    );
    await expect(page.locator("[data-settings-drawer=frame]")).toHaveAttribute("data-expanded", "true");
    await expect(page.locator("#editor [data-focused=true]")).toHaveAttribute(
      "data-key",
      `settings-appearance:${otherTheme}`,
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
    ).toBe(theme === "classic");
  });
}
