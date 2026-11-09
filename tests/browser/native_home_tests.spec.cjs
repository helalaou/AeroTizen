const { test, expect } = require("@playwright/test");

async function setup(page, options = {}) {
  const calls = [];
  const errors = [];
  let report = { status: "not_run", can_set: false, stage: "idle", query: null };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", async (route) => {
    const request = route.request();
    if (!request.url().includes("/diagnostics/native-home")) {
      await route.fulfill({ body: "{}" });
      return;
    }
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "X-AeroTizen-Home-Probe",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
      return;
    }
    calls.push({ method: request.method(), set: request.url().endsWith("/set") });
    if (request.method() === "POST") {
      if (options.lost) {
        await route.abort();
        return;
      }
      if (request.url().endsWith("/set")) {
        report = {
          ...report,
          can_set: false,
          set_test: {
            status: "query_completed",
            stage: "launch_helper",
            query: {
              success: true,
              baseline_unchanged: true,
              steps: [{ key: "operation/main", status: "verified", native_code: 0 }],
            },
          },
        };
      } else {
        report = {
          status: "query_completed",
          stage: "launch_helper",
          can_set: !options.blocked,
          query: {
            main_operation: { status: "ok", value: "com.samsung.tv.csfs" },
            settings: {
              "db/appfw/home_appid": options.blocked
                ? { status: "unavailable", reason: "UnauthorizedAccessException" }
                : { status: "ok", value: "com.samsung.tv.csfs" },
            },
          },
        };
      }
    }
    await route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(report),
    });
  });
  await page.goto("/");
  await page.locator("#gear").click();
  await page.locator('[data-key="section:about"]').click();
  await expect(page.locator("[data-native-test-status]")).toContainText("Run Get test first");
  return { calls, errors };
}

test("remote Get test unlocks Set test and shows verified values", async ({ page }) => {
  const { calls, errors } = await setup(page);
  const get = page.getByRole("button", { name: "Get test", exact: true });
  const set = page.getByRole("button", { name: "Set test", exact: true });
  await expect(set).toHaveAttribute("aria-disabled", "true");
  expect(calls.some((call) => call.method === "POST")).toBe(false);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-native-test-status]")).toContainText("Get test passed");
  await expect(set).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("ArrowRight");
  await expect(set).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-native-test-status]")).toContainText("Set test passed");
  await expect(page.getByText("verified (0)", { exact: true })).toBeVisible();
  await expect(get).toHaveAttribute("aria-disabled", "true");
  await expect(set).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("unavailable getters leave Set test blocked with a visible reason", async ({ page }) => {
  const { calls, errors } = await setup(page, { blocked: true });
  await page.getByRole("button", { name: "Get test", exact: true }).click();
  await expect(page.locator("[data-native-test-status]")).toContainText("Set test is blocked");
  await expect(page.getByText("UnauthorizedAccessException", { exact: true })).toBeVisible();
  const set = page.getByRole("button", { name: "Set test", exact: true });
  await expect(set).toHaveAttribute("aria-disabled", "true");
  await set.click({ force: true });
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a service loss leaves the screen usable and offers recovery", async ({ page }) => {
  const { calls, errors } = await setup(page, { lost: true });
  await page.getByRole("button", { name: "Get test", exact: true }).click();
  await expect(page.locator("[data-native-test-status]")).toContainText("service stopped responding");
  await expect(page.getByRole("button", { name: "Refresh results" })).toHaveAttribute("aria-disabled", "false");
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  expect(errors).toEqual([]);
});
