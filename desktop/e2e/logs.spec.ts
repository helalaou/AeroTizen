import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("shows recent desktop activity and downloads it as a log file", async ({ page, isMobile }) => {
  test.skip(isMobile, "The file download is covered in the desktop project.");
  await page.goto("/?simulator=1");
  await page.getByRole("button", { name: "TV simulator", exact: true }).click();
  const controls = page.getByRole("dialog", { name: "TV simulator", exact: true });
  await controls.getByRole("tab", { name: "Releases", exact: true }).click();
  await controls.getByRole("button", { name: "Use sample releases", exact: true }).click();
  await page.getByRole("button", { name: "Search for TVs", exact: true }).click();
  await page.getByRole("button", { name: "Connect to Lounge TV", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  const actions = page.getByRole("navigation", { name: "Desktop actions" });
  await actions.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Logs", exact: true })).toBeVisible();
  const log = page.getByRole("table", { name: "Desktop logs", exact: true });
  await expect(log.getByRole("row", { name: /Search for TVs/ }).first()).toContainText("Completed");

  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export logs", exact: true }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toMatch(/^aerotizen-desktop-.*\.log$/);
  const text = await readFile(await download.path(), "utf8");
  expect(text).toContain("AeroTizen desktop logs (simulator)");
  expect(text).toContain("Connect to TV");
  expect(text).toContain("Search for TVs\tCompleted");
  expect(text).not.toMatch(/Lounge TV|192\.0\.2\.20/);

  await page.reload();
  await actions.getByRole("button", { name: "Logs", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "Logs", exact: true });
  await expect(reopened.getByRole("row", { name: /Search for TVs/ }).first()).toContainText("Completed");
});
