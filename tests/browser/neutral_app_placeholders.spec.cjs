const { test, expect } = require("./launcher_fixture.cjs");
const { openCategory } = require("./drawer_helpers.cjs");
const { watcherStatus } = require("./watcher_helpers.cjs");

const names = ["YouTube", "Prime Video", "Local app", "A very long installed app name that must wrap inside its tile"];
const ids = ["9Ur5IzDKqV.TizenYouTube", "org.tizen.primevideo", "local.app", "long.app"];
const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"><rect width="304" height="304" fill="#43667c"/></svg>';

const surface = (node) => ({
  colour: getComputedStyle(node).backgroundColor,
  image: getComputedStyle(node).backgroundImage,
});
const themeSurface = (page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--continue-surface)";
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const result = { colour: style.backgroundColor, image: style.backgroundImage };
    probe.remove();
    return result;
  });

for (const [entry, url] of [
  ["compiled", "http://127.0.0.1:8171/"],
  ["development", "http://127.0.0.1:8172/"],
]) {
  for (const theme of ["classic", "glass"]) {
    test(`${entry} ${theme} app placeholders keep names through loading and failure`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      let loading = true;
      const pending = [];
      const requests = [];
      const artwork = async (route) => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        const success = path.includes("111299001912") || path === "/installed-icon.png";
        if (success && loading) await new Promise((resolve) => pending.push(resolve));
        await route.fulfill({ contentType: "image/svg+xml", body: success ? image : "invalid image" });
      };
      await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
      await page.route("http://127.0.0.1:47790/**", (route) =>
        route.fulfill({ json: watcherStatus(route.request().url()) }),
      );
      await page.route("**/opt/share/webappservice/apps_icon/**", artwork);
      await page.route("**/installed-icon.png", artwork);
      await page.route("**/missing-icon.png", artwork);
      await page.addInitScript(
        ({ names, ids, theme }) => {
          localStorage.setItem(
            "aerotizen.apps.v1",
            JSON.stringify(
              ids.map((id, index) => ({ id, name: names[index], icon: index === 2 ? "/installed-icon.png" : "" })),
            ),
          );
          localStorage.setItem(
            "aerotizen.settings.v1",
            JSON.stringify({
              home: ids,
              homeCardColumns: 5,
              theme,
              background: "black",
              showWeather: false,
              showNetwork: false,
              continueWatching: false,
            }),
          );
          window.tizen = {
            application: {
              getAppsInfo: (ready) =>
                ready(
                  ids.map((id, index) => ({
                    id,
                    name: names[index],
                    packageId: "abcdefghij",
                    iconPath: index === 2 ? "/installed-icon.png" : undefined,
                  })),
                ),
              getAppMetaData: () => [],
            },
          };
        },
        { names, ids, theme },
      );
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveTitle("AeroTizen");
      const cards = page.locator("#grid > [data-id]");
      await expect(cards).toHaveCount(4);
      for (const name of names) {
        const card = page.getByRole("button", { name, exact: true });
        await expect(card.locator("[data-app-fallback]")).toBeVisible();
        await expect(card.locator("[data-app-fallback]")).toHaveText(name);
        await expect(card.locator("[data-app-fallback] svg, [data-app-fallback] img")).toHaveCount(0);
      }
      const fills = await cards.evaluateAll((nodes) =>
        nodes.map((node) => ({
          colour: getComputedStyle(node).backgroundColor,
          image: getComputedStyle(node).backgroundImage,
        })),
      );
      const themeFill = await themeSurface(page);
      expect(fills.every((fill) => fill.colour === themeFill.colour && fill.image === themeFill.image)).toBe(true);
      expect(themeFill.image === "none").toBe(theme === "classic");
      const longName = page.getByRole("button", { name: names[3], exact: true }).locator("[data-app-fallback]");
      const bounds = await longName.evaluate((node) => {
        const card = node.getBoundingClientRect();
        const label = node.firstElementChild.getBoundingClientRect();
        return {
          fits:
            label.left >= card.left &&
            label.right <= card.right &&
            label.top >= card.top &&
            label.bottom <= card.bottom,
        };
      });
      expect(bounds.fits).toBe(true);
      expect(await page.evaluate(() => typeof window.LOGOS)).toBe("undefined");
      await expect(page.locator('script[src$="/logos.js"]')).toHaveCount(0);
      loading = false;
      pending.splice(0).forEach((release) => release());
      await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
      for (const name of [names[0], names[2]]) {
        const card = page.getByRole("button", { name, exact: true });
        await expect(card.locator("[data-app-artwork]")).toBeVisible();
      }
      const loadedHome = page.getByRole("button", { name: names[0], exact: true });
      await expect(loadedHome.locator("[data-app-fallback]")).toBeHidden();
      await expect(loadedHome.locator("[data-app-artwork-kind]")).toHaveAttribute("data-app-artwork-kind", "artwork");
      const localHome = page.getByRole("button", { name: names[2], exact: true });
      await expect(localHome.locator("[data-app-artwork-kind]")).toHaveAttribute("data-app-artwork-kind", "icon");
      await expect(localHome.locator("[data-app-fallback]")).toBeVisible();
      await expect(localHome.locator("[data-app-fallback]")).toHaveText(names[2]);
      const iconBounds = await localHome.evaluate((node) => {
        const card = node.getBoundingClientRect();
        const icon = node.querySelector("[data-app-artwork]").getBoundingClientRect();
        const name = node.querySelector("[data-app-fallback]").getBoundingClientRect();
        return {
          smaller: icon.width < card.width / 2,
          below: name.top >= icon.bottom,
          fits: name.bottom <= card.bottom,
        };
      });
      expect(iconBounds).toEqual({ smaller: true, below: true, fits: true });
      await page.locator("#apps-tab").click();
      const localAll = page.locator('#grid > [data-id="local.app"]');
      await expect(localAll.locator("[data-app-artwork]")).toBeVisible();
      await expect(localAll.locator("[data-app-fallback]")).toBeVisible();
      await expect(localAll.locator("[data-app-fallback]")).toHaveText(names[2]);
      await page.locator("#home-tab").click();
      await expect(
        page.getByRole("button", { name: names[1], exact: true }).locator("[data-app-fallback]"),
      ).toBeVisible();
      const failedHome = page.getByRole("button", { name: names[1], exact: true });
      const otherTheme = theme === "glass" ? "classic" : "glass";
      await page.evaluate((theme) => AeroTizen.settings.update({ theme }), otherTheme);
      await expect.poll(() => failedHome.evaluate(surface)).not.toEqual(themeFill);
      expect(await failedHome.evaluate(surface)).toEqual(await themeSurface(page));
      await page.evaluate((theme) => AeroTizen.settings.update({ theme }), theme);
      await expect.poll(() => failedHome.evaluate(surface)).toEqual(themeFill);
      await page.locator("#gear").click();
      await openCategory(page, "apps");
      const localOption = page.locator('[data-key="app:local.app"]');
      await expect(localOption.locator("[data-app-artwork-kind]")).toHaveAttribute("data-app-artwork-kind", "icon");
      await expect(localOption.locator("[data-app-fallback]")).toBeVisible();
      await expect(localOption.locator("[data-app-fallback]")).toHaveText(names[2]);
      const failed = page.locator('[data-key="app:org.tizen.primevideo"]');
      await expect(failed.locator("[data-app-fallback]")).toBeVisible();
      await expect(failed.locator("[data-app-fallback]")).toHaveText(names[1]);
      expect(await failed.evaluate(surface)).toEqual(themeFill);
      const loaded = page.locator('[data-key="app:9Ur5IzDKqV.TizenYouTube"] [data-app-artwork]');
      await expect(loaded).toBeVisible();
      const initialImage = await loaded.elementHandle();
      await failed.click();
      await expect(failed).toHaveAttribute("aria-pressed", "false");
      expect(await loaded.evaluate((node, initial) => node === initial, initialImage)).toBe(true);
      await failed.click();
      await expect(failed).toHaveAttribute("aria-pressed", "true");
      expect(requests).toContain("/installed-icon.png");
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
