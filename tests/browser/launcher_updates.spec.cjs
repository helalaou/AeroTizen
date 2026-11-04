const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const installed = readFileSync(path.join(__dirname, "../../launcher/version.txt"), "utf8").trim();
const [major, minor] = installed.split(".").map(Number);
const update = [major, minor + 1, 0].join(".");
const next = [major, minor + 2, 0].join(".");
const release = (tag_name, overrides = {}) => ({ tag_name, draft: false, prerelease: false, ...overrides });
const changelog = [
  "### Features",
  "* **launcher:** Add a clock layout ([#28](https://github.com/example/project/issues/28)) ([abc](https://github.com/example/project/commit/abc))",
  "### Bug Fixes",
  "* Keep HDMI sources visible, closes [#29](https://github.com/example/project/issues/29)",
].join("\r\n");
const setHidden = (page, value) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);

test("opening About marks a stable launcher update as seen across restarts", async ({ page }) => {
  const errors = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  let checks = 0;
  let latest = update;
  await page.route("https://api.github.com/repos/helalaou/AeroTizen/releases?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("page") === "1") {
      checks++;
      if (latest === null) {
        await route.fulfill({ status: 503 });
        return;
      }
      await route.fulfill({
        headers: {
          "Access-Control-Expose-Headers": "Link",
          Link: '<https://api.github.com/repositories/1/releases?page=2>; rel="next"',
        },
        json: [
          release("cli-v999.0.0"),
          release("launcher-v999.0.0", { draft: true }),
          release("launcher-v998.0.0", { prerelease: true }),
          release("launcher-v999.0.0-beta.1"),
          release("launcher-v" + installed, { body: "* Notes for the installed version" }),
        ],
      });
    } else {
      const body = latest === update ? changelog : "* Improve the Home screen";
      await route.fulfill({ json: [release("launcher-v" + latest, { body })] });
    }
  });
  const start = Date.now();
  await page.clock.setFixedTime(start);
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen");
  const gear = page.locator("#gear");
  const homeDot = gear.locator(".home-update-dot");
  const about = page.locator('[data-section-pane="about"]');
  const notes = about.getByRole("list");
  const aboutCategory = page.locator('[data-key="section:about"]');
  const categoryDot = aboutCategory.locator(".settings-update-dot");
  await expect(homeDot).toBeVisible();
  await expect(gear).toHaveAccessibleName(/Update available/);
  await gear.click();
  await expect(categoryDot).toBeVisible();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowDown");
  await expect(aboutCategory).toBeFocused();
  await expect(categoryDot).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(about).toBeVisible();
  await expect(about.getByText("AeroTizen " + installed)).toBeVisible();
  await expect(about.getByText("Update available: " + update)).toBeVisible();
  await expect(notes.locator("li")).toHaveText(["Add a clock layout", "Keep HDMI sources visible"]);
  await expect(notes).toBeVisible();
  await expect(notes.locator("a")).toHaveCount(0);
  await expect(homeDot).toHaveCount(0);
  await expect(categoryDot).toHaveCount(0);
  await expect(about.getByText("Update available: " + update)).toBeVisible();
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await expect(notes).toBeVisible();
  await expect(about.getByText("aerotizen update launcher")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(aboutCategory).toBeFocused();
  expect(checks).toBe(1);

  await page.reload();
  await expect(gear).toHaveAccessibleName("Settings");
  await page.clock.setFixedTime(start + 23 * 60 * 60 * 1000);
  await setHidden(page, true);
  await setHidden(page, false);
  expect(checks).toBe(1);

  latest = next;
  await page.clock.setFixedTime(start + 25 * 60 * 60 * 1000);
  await setHidden(page, true);
  expect(checks).toBe(1);
  await setHidden(page, false);
  await expect.poll(() => checks).toBe(2);
  await gear.click();
  await aboutCategory.click();
  await expect(about.getByText("Update available: " + next)).toBeVisible();
  await expect(homeDot).toHaveCount(0);

  latest = null;
  await page.clock.setFixedTime(start + 50 * 60 * 60 * 1000);
  await setHidden(page, true);
  const response = page.waitForResponse((result) => result.url().includes("api.github.com") && result.status() === 503);
  await setHidden(page, false);
  await response;
  await expect(about.getByText("Update available: " + next)).toBeVisible();
  await expect(categoryDot).toHaveCount(0);
  await page.reload();
  await expect(gear).toHaveAccessibleName("Settings");
  await gear.click();
  await aboutCategory.click();
  await expect(notes.locator("li")).toHaveText(["Improve the Home screen"]);
  await expect(notes).toBeVisible();
  expect(checks).toBe(3);
  expect(errors).toEqual([]);
});

test("a newer installed launcher re-arms the notice for a further release", async ({ page }) => {
  const olderInstalled = major === 0 ? "0.0.0" : [major - 1, 0, 0].join(".");
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.addInitScript(
    ({ installedVersion, latestVersion, latest }) => {
      localStorage.setItem(
        "aerotizen.launcherUpdate.acknowledgement",
        JSON.stringify({ installedVersion, latestVersion }),
      );
      localStorage.setItem("aerotizen.launcherUpdate.check", JSON.stringify({ latest, attemptedAt: Date.now() }));
    },
    { installedVersion: olderInstalled, latestVersion: installed, latest: update },
  );
  await page.goto("/");
  await expect(page.locator("#gear .home-update-dot")).toBeVisible();
  await page.locator("#gear").click();
  await expect(page.locator('[data-key="section:about"] .settings-update-dot')).toBeVisible();
  await page.locator('[data-key="section:about"]').click();
  await expect(page.locator("#gear .home-update-dot")).toHaveCount(0);
  await expect(page.getByText("Update available: " + update)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What’s new" })).toHaveCount(0);
});
