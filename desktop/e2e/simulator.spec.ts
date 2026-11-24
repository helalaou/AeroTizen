import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("creates a custom TV, handles a failed request and keeps the scenario after reload", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The same service flow is covered once; the drawer also receives a manual mobile layout check.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // Only release metadata may use native IPC; TV and account calls must stay simulated.
  await page.addInitScript(() => {
    let version = "9.0.0";
    Object.defineProperty(window, "__updatePublishedReleases", {
      value: () => {
        version = "9.1.0";
      },
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        invoke: async (command: string) => {
          if (command === "launcher_catalog")
            return [{ version, sections: [{ heading: "Features", changes: ["Published change from GitHub."] }] }];
          throw new Error("Simulator called the native backend");
        },
      },
    });
  });
  const controls = page.getByRole("dialog", { name: "TV simulator" });
  await test.step("Create a rooted TV through the development controls", async () => {
    await page.goto("/?simulator=1");
    await expect(page).toHaveTitle("AeroTizen Desktop");
    await expect(page.getByRole("heading", { name: "Your TVs" })).toBeVisible();
    await page.getByRole("button", { name: "TV simulator" }).click();
    await controls.getByRole("button", { name: "Start empty" }).click();
    await expect(controls).toBeHidden();
    await expect(page.getByRole("region", { name: "Saved TVs" })).toHaveCount(0);
    await page.getByRole("button", { name: "TV simulator" }).click();
    await controls.getByLabel("New TV preset").selectOption("rooted");
    await controls.getByRole("button", { name: "Add TV", exact: true }).click();
    await controls.getByRole("textbox", { name: "TV name" }).fill("Kitchen TV");
    await controls.getByRole("button", { name: "Save and reload preview" }).click();
    await expect(controls).toBeHidden();
    await page.getByRole("button", { name: "Connect to Kitchen TV", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "TV actions" })
      .getByRole("button", { name: "Install & update", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "9.0.0, Latest release", exact: true })).toBeVisible();
    await expect(page.getByText("Published change from GitHub.", { exact: true })).toBeVisible();
    await page.evaluate(() => (window as unknown as { __updatePublishedReleases(): void }).__updatePublishedReleases());
    await page.getByRole("button", { name: "Refresh releases" }).click();
    await expect(page.getByRole("button", { name: "9.1.0, Latest release", exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "TV actions" })
      .getByRole("button", { name: "Apps", exact: true })
      .click();
    await expect(page.getByRole("row", { name: /SecurityCenter/ })).toContainText("Protected");
  });
  await test.step("Fail one app refresh and recover on retry", async () => {
    await page.getByRole("button", { name: "TV simulator" }).click();
    await controls.getByRole("tab", { name: "Requests", exact: true }).click();
    await controls.getByLabel("Request to fail").selectOption("listApps");
    await controls.getByRole("textbox", { name: "Error message" }).fill("Simulated app list failure");
    await controls.getByRole("button", { name: "Fail next request" }).click();
    await expect(controls.getByText("Failure armed")).toBeVisible();
    await page.screenshot({ path: join(tmpdir(), "aerotizen-simulator-controls.png") });
    await controls.getByRole("button", { name: "Close TV simulator" }).click();
    await page.getByRole("button", { name: "Refresh apps" }).click();
    await expect(page.getByRole("alert")).toContainText("Simulated app list failure");
    await page.getByRole("button", { name: "Refresh apps" }).click();
    await expect(page.getByRole("row", { name: /SecurityCenter/ })).toBeVisible();
    await expect(page.getByText("Simulated app list failure", { exact: true })).toHaveCount(0);
  });
  await test.step("Reload and reconnect with the saved custom TV", async () => {
    await page.reload();
    await page.getByRole("button", { name: "Connect to Kitchen TV", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await page.screenshot({ path: join(tmpdir(), "aerotizen-simulator-overview.png") });
    expect(errors).toEqual([]);
  });
});
