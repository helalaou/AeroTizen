import { expect } from "@playwright/test";
import { test } from "./fixtures";
import type { Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function showAction(page: Page, isMobile: boolean, name: string) {
  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  await page.getByRole("navigation", { name: "TV actions" }).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
}

test("navigates the selected TV actions and keeps the initial screen TV-only", async ({ page, isMobile }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "TV actions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect to Living room" }).click();
  await page.getByRole("button", { name: "Update available", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Launcher", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("Installed version: 3.0.0")).toBeVisible();
  await expect(page.getByText("Latest version: 3.1.0")).toBeVisible();
  const latestNotes = page.getByRole("region", { name: "Changes in 3.1.0" });
  await expect(latestNotes.getByText("Add a clock setting.")).toBeVisible();
  const version = page.getByRole("combobox", { name: "Launcher version" });
  await expect(page.getByRole("button", { name: "Update to 3.1.0" })).toBeEnabled();
  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  const nav = page.getByRole("navigation", { name: "TV actions" });
  await expect(nav.getByRole("button")).toHaveText(["Overview", "Launcher"]);
  await expect(nav.getByRole("button", { name: "Launcher", exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: join(tmpdir(), `aerotizen-tv-sidebar-${info.project.name}.png`) });
  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  await page.getByRole("button", { name: "Update to 3.1.0" }).click();
  await expect(page.getByText("AeroTizen 3.1.0 installed and verified.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Already installed" })).toBeDisabled();
  await showAction(page, isMobile, "Overview");
  await expect(page.getByRole("button", { name: "Update available", exact: true })).toHaveCount(0);
  await showAction(page, isMobile, "Launcher");
  await page.getByRole("button", { name: "Choose another version" }).click();
  await version.selectOption("3.0.0");
  await expect(page.getByRole("region", { name: "Changes in 3.0.0" })).toContainText("No changes listed.");
  await version.selectOption("2.7.0");
  const olderNotes = page.getByRole("region", { name: "Changes in 2.7.0" });
  await expect(olderNotes.getByText("Fix app card spacing.")).toBeVisible();
  await expect(olderNotes.getByRole("link", { name: "View release on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/helalaou/AeroTizen/releases/tag/launcher-v2.7.0",
  );
  await expect(latestNotes).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const downgrade = page.getByRole("dialog", { name: "Downgrade to 2.7.0" });
  await expect(downgrade).toHaveCount(0);
  const downgradeButton = page.getByRole("button", { name: "Downgrade to 2.7.0", exact: true });
  await downgradeButton.click();
  await expect(downgrade.getByText(/may fail to read settings/)).toBeVisible();
  await downgrade.getByRole("button", { name: "Cancel" }).click();
  await expect(downgrade).toBeHidden();
  await expect(page.getByText("Installed version: 3.1.0")).toBeVisible();
  await downgradeButton.click();
  await downgrade.getByRole("button", { name: "Downgrade to 2.7.0" }).click();
  await expect(page.getByText("Installed version: 2.7.0")).toBeVisible();
  await showAction(page, isMobile, "Overview");
  const href = await page.getByRole("link", { name: "Report issue" }).getAttribute("href");
  expect(new URL(href ?? "").searchParams.get("diagnostics")).toContain("Launcher version: 2.7.0");
  expect(errors).toEqual([]);
});

test("installs on a TV without a launcher and shows the version on Overview", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect to Bedroom" }).click();
  await showAction(page, isMobile, "Launcher");
  await page.getByRole("button", { name: "Install 3.1.0" }).click();
  await expect(page.getByText("AeroTizen 3.1.0 installed and verified.")).toBeVisible();
  await showAction(page, isMobile, "Overview");
  await expect(page.getByRole("main").getByText("3.1.0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update available" })).toHaveCount(0);
});
