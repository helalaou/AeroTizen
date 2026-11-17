import { expect } from "@playwright/test";
import { test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testPackages } from "../src/test/tvs";

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
  await expect(nav.getByRole("button")).toHaveText(["Overview", "Launcher", "Apps", "Home and startup"]);
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

test("shows the connected TV's Home button, startup, routing and backup status", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect to Living room" }).click();
  await showAction(page, isMobile, "Home and startup");
  const homeButton = page.getByRole("region", { name: "Home button", exact: true });
  const startup = page.getByRole("region", { name: "Startup", exact: true });
  const routing = page.getByRole("region", { name: "AeroTizen routing", exact: true });
  const backup = page.getByRole("dialog", { name: "Original Home backup" });
  const titleRow = page.getByRole("heading", { name: "Home and startup", level: 1 }).locator("..");
  const backupButton = titleRow.getByRole("button", { name: "Backup & restore", exact: true });
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["AeroTizen routing", "Home button", "Startup"]);
  await expect(routing.getByText("Native Home mode", { exact: true })).toBeVisible();
  await expect(backup).toBeHidden();
  await backupButton.click();
  await expect(backup.getByText(/Original backup saved/)).toBeVisible();
  await expect(backup.getByText("Samsung Home", { exact: true })).toHaveCount(3);
  await expect(backup.getByText("TV viewer", { exact: true })).toHaveCount(2);
  await expect(backup.getByText("Off", { exact: true })).toBeVisible();
  await backup.getByRole("button", { name: "Restore original settings", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Restore original settings?" });
  await expect(review.getByText("Living room", { exact: true })).toBeVisible();
  await expect(review.getByText("Samsung Home", { exact: true })).toHaveCount(3);
  await expect(review.getByRole("button", { name: "Confirm restore", exact: true })).toBeEnabled();
  await expect(review.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await backup.getByRole("button", { name: "Restore original settings", exact: true }).click();
  await review.getByRole("button", { name: "Confirm restore", exact: true }).click();
  await expect(backup.getByText("Home backup restored.")).toBeVisible();
  await backup.getByRole("button", { name: "Done" }).click();
  await expect(backup).toBeHidden();
  await expect(routing.getByText("Watcher", { exact: true })).toBeVisible();
  const setting = (section: Locator, label: string) =>
    section
      .locator("dl > div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("dd");
  await expect(setting(homeButton, "Current assignment")).toHaveText("Samsung Home");
  await expect(setting(homeButton, "Saved Home setting")).toHaveText("Samsung Home");
  await expect(setting(startup, "Startup app")).toHaveText("TV viewer");
  await expect(setting(startup, "Backup startup app")).toHaveText("TV viewer");
  await expect(setting(startup, "Smart Hub autostart")).toHaveText("Off");

  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  await page.getByRole("button", { name: "Back to TVs" }).click();
  await page.getByRole("button", { name: "Connect to Bedroom" }).click();
  await showAction(page, isMobile, "Home and startup");
  await expect(homeButton).toHaveCount(0);
  await expect(startup).toHaveCount(0);
  await expect(routing.getByText("Unavailable", { exact: true })).toBeVisible();
  await titleRow.getByRole("button", { name: "Backup status", exact: true }).click();
  await expect(backup.getByText("No original Home backup found on this computer.")).toBeVisible();
  await expect(backup.getByRole("button", { name: "Restore original settings", exact: true })).toHaveCount(0);
});

test("applies Native Home, backing up the original settings first", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search for TVs" }).click();
  await page.getByRole("button", { name: "Connect to Office at 192.0.2.22", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await showAction(page, isMobile, "Home and startup");
  const routing = page.getByRole("region", { name: "AeroTizen routing", exact: true });
  await expect(routing.getByText("Watcher", { exact: true })).toBeVisible();
  const applyButton = page.getByRole("button", { name: "Apply Native Home", exact: true });
  await expect(applyButton).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Apply Native Home?" });
  await applyButton.click();
  await expect(dialog.getByText("Office", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/will be backed up before AeroTizen opens/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(routing.getByText("Watcher", { exact: true })).toBeVisible();

  await applyButton.click();
  await dialog.getByRole("button", { name: "Confirm apply", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(routing.getByText("Native Home mode", { exact: true })).toBeVisible();
  await expect(applyButton).toHaveCount(0);

  const titleRow = page.getByRole("heading", { name: "Home and startup", level: 1 }).locator("..");
  await titleRow.getByRole("button", { name: "Backup & restore", exact: true }).click();
  const backup = page.getByRole("dialog", { name: "Original Home backup" });
  await expect(backup.getByText(/Original backup saved/)).toBeVisible();
  await expect(backup.getByRole("button", { name: "Restore original settings", exact: true })).toBeEnabled();
});

test.describe("Installed apps", () => {
  test.use({
    inventory: {
      failures: {
        "test.package.0": { status: "refused" },
        "test.package.1": { status: "still_installed", detail: "Uninstall failed (1009)" },
      },
      packages: [
        ...testPackages,
        ...Array.from({ length: 30 }, (_, index) => ({
          id: `test.package.${index}`,
          name: `Test app ${index}`,
          apps: [`Test app ${index}`],
          protected: false,
          revision: "a".repeat(64),
        })),
      ],
    },
  });

  test("keeps search and package count docked while scrolling the app list", async ({ page, isMobile, inventory }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect to Living room" }).click();
    await showAction(page, isMobile, "Apps");
    const results = page.getByRole("region", { name: "App search results" });
    const list = results.getByRole("table", { name: "Installed app packages" });
    const launcher = list.getByRole("row").filter({ hasText: "AeroTizen" });
    const player = list.getByRole("row").filter({ hasText: "Player" });
    await expect(launcher.getByText("Protected", { exact: true })).toBeVisible();
    await expect(player.getByText("Protected", { exact: true })).toHaveCount(0);
    const search = page.getByRole("searchbox", { name: "Search installed apps" });
    const total = inventory.packages.length;
    const count = page.getByText(`${total} packages`, { exact: true });
    await expect(count).toBeInViewport();
    const searchPosition = await search.boundingBox();
    const countPosition = await count.boundingBox();
    await results.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await search.boundingBox()).toEqual(searchPosition);
    expect(await count.boundingBox()).toEqual(countPosition);
    await expect(count).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await search.fill("MEdiA CoMpaNiON");
    await expect(page.getByText(`1 of ${total} packages`, { exact: true })).toBeVisible();
    await expect(player).toBeInViewport();
    await expect(launcher).toHaveCount(0);
    await search.fill("no matching package");
    await expect(page.getByText(`0 of ${total} packages`, { exact: true })).toBeVisible();
    await expect(page.getByText("No apps match your search.")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(launcher).toBeVisible();
    await expect(player).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("reviews selected app packages across filters and excludes protected packages", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect to Living room" }).click();
    await showAction(page, isMobile, "Apps");
    const review = page.getByRole("button", { name: /^Remove/ });
    const search = page.getByRole("searchbox", { name: "Search installed apps" });
    await expect(review).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "AeroTizen" })).toBeDisabled();
    const securityCenter = page.getByRole("row").filter({ hasText: "SecurityCenter" });
    await expect(securityCenter.getByRole("checkbox")).toBeDisabled();
    await securityCenter.getByRole("cell").last().click();
    await expect(securityCenter.getByRole("checkbox")).not.toBeChecked();
    const playerRow = page.getByRole("row").filter({ hasText: "Player" });
    const player = playerRow.getByRole("checkbox");
    await playerRow.getByText("Player", { exact: true }).click();
    await expect(player).toBeChecked();
    await playerRow.getByRole("cell").last().click();
    await expect(player).not.toBeChecked();
    await playerRow.getByRole("cell").last().click();
    await expect(player).toBeChecked();
    await search.fill("Test app 0");
    await page.getByRole("checkbox", { name: "Test app 0", exact: true }).check();
    await search.fill("SecurityCenter");
    await expect(review).toHaveText("Remove (2)");
    await review.click();
    const preview = page.getByRole("dialog", { name: "Remove apps?" });
    await expect(preview).toContainText("Living room");
    await expect(preview).toContainText("Player");
    await expect(preview).toContainText("Media Companion");
    await expect(preview).toContainText("Test app 0");
    await expect(preview).not.toContainText("SecurityCenter");
    await expect(preview).toContainText("saved data");
    await preview.getByRole("button", { name: "Cancel" }).click();
    await expect(preview).toBeHidden();
    await search.clear();
    await expect(player).toBeChecked();
    if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
    await page.getByRole("button", { name: "Refresh TV connection" }).click();
    await expect(review).toBeDisabled();
    await expect(player).not.toBeChecked();
  });

  test("confirms removal and shows verified and refused results", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect to Living room" }).click();
    await showAction(page, isMobile, "Apps");
    const results = page.getByRole("region", { name: "App search results" });
    const deleteOnTv = results.getByText("Delete on TV", { exact: true });
    const refused = results
      .getByRole("row")
      .filter({ has: page.getByRole("checkbox", { name: "Test app 0", exact: true }) });
    await page.getByRole("checkbox", { name: /^Player/ }).check();
    await page.getByRole("checkbox", { name: "Test app 0", exact: true }).check();
    await page.getByRole("checkbox", { name: "Test app 1", exact: true }).check();
    await expect(deleteOnTv).toHaveCount(0);
    await page.getByRole("button", { name: "Remove (3)", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Remove apps?" });
    await confirmation.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByText("Player · Removed", { exact: true })).toBeInViewport();
    await expect(page.getByText("Test app 0 · Failed to uninstall", { exact: true })).toBeInViewport();
    await expect(page.getByText("Can not uninstall app", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Uninstall failed (1009)", { exact: true })).toBeVisible();
    await expect(deleteOnTv).toHaveCount(1);
    await expect(refused.getByText("Delete on TV", { exact: true })).toBeVisible();
    await expect(page.getByText("You can check for a Delete option in Apps → Settings on the TV.")).toBeInViewport();
    await expect(page.getByRole("checkbox", { name: /^Player/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Test app 0", exact: true })).not.toBeChecked();
    const banner = page.getByRole("status", { name: "Removal results" });
    const bannerPosition = await banner.boundingBox();
    await results.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await banner.boundingBox()).toEqual(bannerPosition);
    await showAction(page, isMobile, "Launcher");
    await showAction(page, isMobile, "Apps");
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh apps", exact: true }).click();
    await expect(refused.getByText("Delete on TV", { exact: true })).toBeVisible();
  });
});
