const { test, expect } = require("@playwright/test");

test.use({ locale: "ja-JP", viewport: { width: 1280, height: 720 } });

test("language selection uses the English fallback offline and persists through reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.abort());
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "App views" })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (let index = 0; index < 6; index++) await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Language", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");

  const auto = page.getByRole("button", { name: "Use TV language" });
  const english = page.getByRole("button", { name: "English" });
  await expect(auto).toHaveAttribute("aria-pressed", "true");
  await expect(auto).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(english).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(english).toHaveAttribute("aria-pressed", "true");
  await expect(english).toBeFocused();

  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(english).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
