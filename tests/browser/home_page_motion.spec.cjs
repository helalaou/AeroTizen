const { test, expect } = require("@playwright/test");
for (const glassSettings of [false, true]) {
  test(`${glassSettings ? "Glass" : "Classic"} page reveals preserve cached artwork and accept immediate remote input`, async ({
    page,
  }) => {
    await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
    await page.addInitScript(
      (glassSettings) =>
        localStorage.setItem(
          "aerotizen.settings.v1",
          JSON.stringify({
            glassSettings,
            home: ["demo0", "demo1", "demo2", "demo3"],
            background: "black",
            showWeather: false,
          }),
        ),
      glassSettings,
    );
    await page.goto("/");
    await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
    const surface = page.locator("[data-home-page]");
    const homeAnimation = await surface.evaluate((node) => getComputedStyle(node).animationName);
    expect(homeAnimation).not.toBe("none");
    await page.evaluate(() => {
      window.savedHomeCard = document.querySelector("#grid > [data-id]");
    });
    expect(await page.locator("[data-header-focus=tabs]").evaluate((n) => getComputedStyle(n).transitionProperty)).toBe(
      "none",
    );
    await page.locator("#apps-tab").click();
    await expect(surface).not.toHaveCSS("animation-name", homeAnimation);
    await expect(surface).not.toHaveCSS("animation-name", "none");
    expect(
      await page.locator("[data-header-focus=tabs]").evaluate((n) => getComputedStyle(n).transitionProperty),
    ).toContain("transform");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#grid > [data-id]").first()).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("Escape");
    await expect(surface).toHaveCSS("animation-name", homeAnimation);
    expect(await page.evaluate(() => window.savedHomeCard === document.querySelector("#grid > [data-id]"))).toBe(true);
    for (let i = 0; i < 3; i++) {
      await page.locator("#apps-tab").click();
      await page.keyboard.press("Escape");
    }
    await expect(page.locator("#home-tab")).toHaveAttribute("data-focused", "true");
    await expect(page.locator("#grid > [data-id]")).toHaveCount(4);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#samsung-home-shortcut")).toHaveAttribute("data-focused", "true");
    await page.evaluate(() => {
      window.samsungEscapes = 0;
      AeroTizen.homewatch.openSamsungHome = () => {
        window.samsungEscapes++;
      };
    });
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.samsungEscapes)).toBe(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#apps-tab").click();
    await expect(surface).toHaveCSS("animation-duration", "0s");
    await expect(surface).toHaveCSS("opacity", "1");
    expect(await surface.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).isIdentity)).toBe(true);
  });
}
