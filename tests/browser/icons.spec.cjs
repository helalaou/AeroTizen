const { test, expect } = require("@playwright/test");
const { openCategory, closeSettings } = require("./drawer_helpers.cjs");

for (const glass of [false, true]) {
  test(`${glass ? "Glass" : "Classic"} icons keep labels, status meaning and selected choices`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
    await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
    await page.addInitScript((glass) => {
      localStorage.setItem(
        "aerotizen.settings.v1",
        JSON.stringify({
          glassSettings: glass,
          home: ["demo0"],
          background: "black",
          showWeather: true,
          tempUnit: "C",
          inputNames: { "HDMI 1": "Xbox", "HDMI 2": "PC", "HDMI 3": "Apple TV" },
        }),
      );
      localStorage.setItem(
        "aerotizen.weather.v2",
        JSON.stringify({
          temp: 12,
          code: 3,
          city: "Test city",
          source: "auto",
          unit: "C",
          at: Date.now(),
        }),
      );
      window.iconNetwork = { kind: "WIFI", strength: 0.2 };
      window.tizen = {
        systeminfo: {
          getPropertyValue(name, done) {
            if (name === "NETWORK") done({ networkType: window.iconNetwork.kind });
            if (name === "WIFI_NETWORK") done({ signalStrength: window.iconNetwork.strength });
            if (name === "VIDEOSOURCE")
              done({
                connected: [{ type: "TV", number: 1 }, ...[1, 2, 3, 4].map((number) => ({ type: "HDMI", number }))],
                disconnected: [],
              });
          },
        },
      };
    }, glass);
    await page.goto("/");
    await expect(page).toHaveTitle("AeroTizen");
    await page.waitForFunction(() => AeroTizen.apps.ready);
    const gear = page.getByRole("button", { name: "Settings", exact: true });
    await expect(gear.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(gear.locator("svg")).toHaveAttribute("focusable", "false");
    await expect(gear.locator("svg")).toHaveAttribute("stroke", "currentColor");
    await expect(gear.locator("svg")).toHaveAttribute("stroke-width", "2");
    await expect(page.locator("#inputs .lucide-gamepad-2")).toHaveCount(1);
    await expect(page.locator("#inputs .lucide-monitor")).toHaveCount(1);
    await expect(page.locator("#inputs .lucide-rectangle-ellipsis")).toHaveCount(1);
    await expect(page.locator("#inputs .lucide-hdmi-port")).toHaveCount(1);
    await expect(page.locator("#inputs .lucide-tv")).toHaveCount(1);
    for (const [kind, strength, glyph, label] of [
      ["WIFI", 0.2, "wifi-low", "Wi-Fi"],
      ["WIFI", 0.5, "wifi-high", "Wi-Fi"],
      ["WIFI", 1, "wifi", "Wi-Fi"],
      ["WIFI", null, "wifi", "Wi-Fi (signal unavailable)"],
      ["ETHERNET", null, "ethernet-port", "Ethernet"],
      ["NONE", null, "wifi-off", "Offline"],
    ]) {
      await page.evaluate(
        ({ kind, strength }) => {
          window.iconNetwork = { kind, strength };
          AeroTizen.network.refresh();
        },
        { kind, strength },
      );
      await expect(page.locator("#network")).toHaveClass(new RegExp("lucide-" + glyph + "(?: |$)"));
      await expect(page.getByRole("img", { name: label, exact: true })).toHaveAttribute("id", "network");
      await expect(page.locator("#network")).not.toHaveAttribute("aria-hidden", "true");
    }
    for (const [code, glyph] of [
      [0, "sun"],
      [2, "cloud-sun"],
      [3, "cloud"],
      [45, "cloud-fog"],
      [51, "cloud-rain"],
      [71, "cloud-snow"],
      [95, "cloud-lightning"],
    ]) {
      await page.evaluate((code) => {
        const cache = JSON.parse(localStorage.getItem("aerotizen.weather.v2"));
        localStorage.setItem("aerotizen.weather.v2", JSON.stringify({ ...cache, code, at: Date.now() }));
        window.Weather.start();
      }, code);
      await expect(page.locator("#weather svg")).toHaveClass(new RegExp("lucide-" + glyph + "(?: |$)"));
      await expect(page.locator("#weather b")).toHaveText("12°");
    }
    await gear.click();
    await openCategory(page, "apps");
    const selectedApp = page.locator('[data-key="app:demo0"]');
    await expect(selectedApp.locator(".selection-indicator .lucide-check")).toBeVisible();
    await selectedApp.click();
    await expect(selectedApp).toHaveAttribute("aria-pressed", "false");
    await expect(selectedApp.locator(".selection-indicator")).toHaveCount(0);
    await selectedApp.click();
    await expect(selectedApp.locator(".selection-indicator")).toBeVisible();
    await expect(selectedApp.locator(".selection-indicator")).toHaveCSS(
      "background-color",
      glass ? "rgb(71, 82, 105)" : "rgb(124, 92, 255)",
    );
    await openCategory(page, "wallpaper");
    await expect(page.locator('[data-key="bg:black"] .selection-indicator')).toBeVisible();
    await closeSettings(page);
    await expect(page.locator("#grid > .tile")).toHaveCount(1);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
