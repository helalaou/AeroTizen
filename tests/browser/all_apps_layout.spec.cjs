const { test, expect } = require("./launcher_fixture.cjs");

const APP_SIZES = [
  { name: "Small", homeColumns: 5, allAppsColumns: 6 },
  { name: "Medium", homeColumns: 4, allAppsColumns: 5 },
  { name: "Large", homeColumns: 3, allAppsColumns: 4 },
];
const CLOCK_STYLES = ["classic", "vertical", "horizontal", "minimal", "bold"];

for (const theme of ["classic", "glass"]) {
  for (const size of APP_SIZES) {
    test(`${theme} All apps ${size.name} fills each row below every clock`, async ({ page }, info) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
      await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
      await page.clock.setFixedTime(new Date("2026-11-18T15:00:00Z"));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        ({ theme, columns }) => {
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({
              theme,
              homeCardColumns: columns,
              homeAppLayout: "grid",
              showWeather: false,
              background: "black",
            }),
          );
        },
        { theme, columns: size.homeColumns },
      );
      await page.goto("/");
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      await page.locator("#apps-tab").click();
      const grid = page.locator("#grid");
      const cards = grid.locator(":scope > [role=button]");
      let cardWidth;
      for (const clock of CLOCK_STYLES) {
        await page.evaluate((clock) => {
          AeroTizen.settings.update({
            clockLayout: clock === "classic" ? "classic" : "custom",
            aeroClockStyle: clock === "classic" ? "vertical" : clock,
          });
        }, clock);
        await page.locator("#apps-tab").click();
        await expect(grid).toHaveAttribute("data-columns", String(size.allAppsColumns));
        const geometry = await grid.evaluate((grid) => {
          const bounds = grid.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            cards: Array.from(grid.children).map((card) => {
              const rect = card.getBoundingClientRect();
              return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height };
            }),
          };
        });
        const firstRow = geometry.cards.filter((card) => card.top === geometry.cards[0].top);
        expect(firstRow).toHaveLength(size.allAppsColumns);
        expect(firstRow[0].left).toBeCloseTo(geometry.left, 1);
        expect(firstRow[firstRow.length - 1].right).toBeCloseTo(geometry.right, 1);
        for (const card of geometry.cards) {
          expect(card.width).toBeCloseTo(card.height, 1);
          expect(card.width).toBeCloseTo(firstRow[0].width, 1);
          expect(card.left).toBeGreaterThanOrEqual(geometry.left);
          expect(card.right).toBeLessThanOrEqual(geometry.right + 0.1);
        }
        cardWidth ??= firstRow[0].width;
        expect(firstRow[0].width).toBeCloseTo(cardWidth, 1);
        await page.keyboard.press("ArrowDown");
        await expect(cards.first()).toBeFocused();
        for (let column = 1; column < size.allAppsColumns; column++) {
          await page.keyboard.press("ArrowRight");
        }
        await expect(cards.nth(size.allAppsColumns - 1)).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(cards.nth(size.allAppsColumns * 2 - 1)).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(cards.nth(size.allAppsColumns - 1)).toBeFocused();
        if (clock === "classic") {
          await page.screenshot({ path: info.outputPath("all-apps-" + size.name.toLowerCase() + ".png") });
        }
      }
      // Home's horizontal layout must not change the All apps grid.
      await page.evaluate(() => AeroTizen.settings.update({ homeAppLayout: "scroll", language: "ar" }));
      await page.locator("#apps-tab").click();
      await expect(grid).toHaveAttribute("data-scroll", "false");
      const rtl = await cards.evaluateAll((cards) => cards.slice(0, 2).map((card) => card.getBoundingClientRect().x));
      expect(rtl[0]).toBeGreaterThan(rtl[1]);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowLeft");
      await expect(cards.nth(1)).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(cards.nth(size.allAppsColumns + 1)).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}
