const { test, expect } = require("@playwright/test");
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
  for (const glass of [false, true]) {
    test(`${entry} ${glass ? "Glass" : "Classic"} app placeholders keep names through loading and failure`, async ({
      page,
    }) => {
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
        ({ names, ids, glass }) => {
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
              glassSettings: glass,
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
        { names, ids, glass },
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
      const theme = await themeSurface(page);
      expect(fills.every((fill) => fill.colour === theme.colour && fill.image === theme.image)).toBe(true);
      expect(theme.image === "none").toBe(!glass);
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
        await expect(card.locator("[data-app-fallback]")).toBeHidden();
      }
      await expect(
        page.getByRole("button", { name: names[1], exact: true }).locator("[data-app-fallback]"),
      ).toBeVisible();
      const failedHome = page.getByRole("button", { name: names[1], exact: true });
      await page.evaluate((next) => AeroTizen.settings.update({ glassSettings: next }), !glass);
      await expect.poll(() => failedHome.evaluate(surface)).not.toEqual(theme);
      expect(await failedHome.evaluate(surface)).toEqual(await themeSurface(page));
      await page.evaluate((next) => AeroTizen.settings.update({ glassSettings: next }), glass);
      await expect.poll(() => failedHome.evaluate(surface)).toEqual(theme);
      await page.locator("#gear").click();
      await openCategory(page, "apps");
      const failed = page.locator('[data-key="app:org.tizen.primevideo"]');
      await expect(failed.locator("[data-app-fallback]")).toBeVisible();
      await expect(failed.locator("[data-app-fallback]")).toHaveText(names[1]);
      expect(await failed.evaluate(surface)).toEqual(theme);
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
