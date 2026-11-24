import { expect } from "@playwright/test";
import { test } from "./fixtures";
import type { Page } from "@playwright/test";
import { bedroom, livingRoom, testRootOutdated, testRootReady } from "../src/test/tvs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function showRoot(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await page
    .getByRole("navigation", { name: "TV actions" })
    .getByRole("button", { name: "Root access", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Root access", level: 1 })).toBeVisible();
}

test("shows live root status on the ready demo TV", async ({ page, isMobile }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect to Living room", exact: true }).click();
  await showRoot(page, isMobile);
  await expect(page.getByText(testRootOutdated.runtime_version!, { exact: true })).toBeVisible();
  await expect(page.getByText("Saved on this computer", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up root access", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh root status" }).click();
  await expect(page.getByText(testRootOutdated.runtime_version!, { exact: true })).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `root-access-ready-${info.project.name}.png`) });
});

test("confirms a helper update, resumes after reload and verifies a new boot", async ({ page, isMobile }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Connect to Living room", exact: true }).click();
  await showRoot(page, isMobile);
  await page.getByRole("button", { name: "Update available" }).click();
  let dialog = page.getByRole("dialog", { name: "Update root access" });
  await expect(dialog.getByRole("button", { name: "Install update" })).toBeDisabled();
  await page.screenshot({ path: join(tmpdir(), `root-update-review-${info.project.name}.png`) });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Install update" }).click();
  await expect(dialog.getByText("Restart the TV to finish the update")).toBeVisible();
  await dialog.getByRole("button", { name: "Check after restart" }).click();
  await expect(dialog.getByText(/update is not verified yet/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Connect to Living room", exact: true }).click();
  await showRoot(page, isMobile);
  await page.getByRole("button", { name: "Continue update" }).click();
  dialog = page.getByRole("dialog", { name: "Update root access" });
  await expect(dialog.getByRole("button", { name: "Demo: restart TV" })).toHaveCount(0);
  await expect(dialog.getByText("127.0.0.1", { exact: true })).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `root-update-restart-${info.project.name}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate((id) => {
    (window as unknown as { __restartDemoRoot(id: string): void }).__restartDemoRoot(id);
  }, livingRoom.id);
  await dialog.getByRole("button", { name: "Check after restart" }).click();
  await expect(page.getByText("Root access updated to 3.0.1 on Living room.")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Update available" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guides signing and setup, survives reload and requires a verified demo boot", async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Connect to Bedroom", exact: true }).click();
  await showRoot(page, isMobile);
  await page.getByRole("button", { name: "Set up root access", exact: true }).click();
  let wizard = page.getByRole("dialog", { name: "Set up root access", exact: true });
  await expect(wizard.getByRole("button", { name: "Start setup" })).toBeDisabled();
  await wizard.getByRole("checkbox").check();
  await wizard.getByRole("button", { name: "Start setup" }).click();
  await page
    .getByRole("dialog", { name: "Set up Bedroom" })
    .getByRole("button", { name: "Sign in with Samsung" })
    .click();
  await expect(wizard.getByText("Restart the TV to finish setup")).toBeVisible();
  await expect(wizard.getByRole("button", { name: "Demo: restart TV" })).toHaveCount(0);
  await wizard.getByRole("button", { name: "Check after restart" }).click();
  await expect(wizard.getByText(/has not confirmed automatic root access/)).toBeVisible();
  await wizard.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Connect to Bedroom", exact: true }).click();
  await showRoot(page, isMobile);
  await expect(page.getByRole("heading", { name: "Waiting for TV restart" })).toBeVisible();
  await page.getByRole("button", { name: "Continue setup" }).click();
  wizard = page.getByRole("dialog", { name: "Set up root access", exact: true });
  await expect(wizard.getByText("127.0.0.1", { exact: true })).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `root-access-restart-${info.project.name}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate((id) => {
    const fixture = window as unknown as { __restartDemoRoot(id: string): void };
    fixture.__restartDemoRoot(id);
  }, bedroom.id);
  await wizard.getByRole("button", { name: "Check after restart" }).click();
  await expect(page.getByText("Root access is ready on Bedroom.")).toBeVisible();
  await expect(wizard).toBeHidden();
  await expect(page.getByText(testRootReady.runtime_version!, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
