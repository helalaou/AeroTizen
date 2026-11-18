import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { testRootOutdated } from "../src/test/tvs";
import type { Locator } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function rightEdge(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error("Expected a visible TV action");
  return bounds.x + bounds.width;
}

function heldResponse() {
  let release = () => {};
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { response, release: () => release() };
}

test("reconnects from the saved TV menu and refreshes from the sidebar", async ({ page, isMobile }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("AeroTizen Desktop");
  await expect(page.getByRole("heading", { name: "Your TVs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search for TVs" })).toBeEnabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.screenshot({ path: join(tmpdir(), `aerotizen-selection-${testInfo.project.name}.png`) });
  await page.getByRole("button", { name: "Options for Living room" }).click();
  await page.getByRole("menuitem", { name: "Connect at another address" }).click();
  const addressDialog = page.getByRole("dialog", { name: "Connect to a TV" });
  const address = addressDialog.getByRole("textbox", { name: "TV IP address" });
  await address.fill("192.0.2.21");
  await addressDialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(addressDialog.getByText("This address belongs to a different TV. No changes were made.")).toBeVisible();
  await address.fill("192.0.2.20");
  await addressDialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(addressDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Host PC IP on TV", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect at another address" })).toHaveCount(0);
  await page.screenshot({ path: join(tmpdir(), `aerotizen-overview-${testInfo.project.name}.png`) });
  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  const nav = page.getByRole("navigation", { name: "TV actions" });
  await expect(nav.getByRole("button")).toHaveText([
    "Overview",
    "Launcher",
    "Apps",
    "Home and startup",
    "Button mapping",
    "Root access",
  ]);
  await nav.getByRole("button", { name: "Launcher" }).click();
  await page.getByRole("button", { name: "Choose another version" }).click();
  const version = page.getByRole("combobox", { name: "Launcher version" });
  await version.selectOption("2.7.0");
  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  const refresh = page.getByRole("button", { name: "Refresh TV connection" });
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect(version).toHaveValue("2.7.0");
  await page.getByRole("button", { name: "Back to TVs" }).click();
  await expect(page.getByRole("heading", { name: "Your TVs" })).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("hides the empty saved list in a short window and restores it when TVs are saved", async ({
  page,
  isMobile,
}, testInfo) => {
  if (!isMobile) await page.setViewportSize({ width: 1120, height: 600 });
  await page.goto("/");
  for (const name of ["Bedroom", "Living room"]) {
    await page.getByRole("button", { name: `Options for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Forget TV" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Forget TV", exact: true }).click();
  }
  await expect(page.getByRole("region", { name: "Saved TVs" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "TVs on your network" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBe(0);
  await page.screenshot({ path: join(tmpdir(), `aerotizen-empty-saved-${testInfo.project.name}.png`) });
  await page.getByRole("button", { name: "Search for TVs" }).click();
  await page.getByRole("button", { name: "Connect to Bedroom at 192.0.2.21" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Connect to Bedroom", exact: true })).toBeVisible();
});

test("shows root access and opens a pre-filled GitHub draft without private fields", async ({ page, context }) => {
  await context.route("https://github.com/helalaou/AeroTizen/issues/new?*", (route) =>
    route.fulfill({ body: "GitHub draft navigation intercepted by test" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Connect to Living room", exact: true }).click();
  await expect(page.getByText("Yes", { exact: true })).toBeVisible();
  await expect(page.getByText("Root helper version", { exact: true }).locator("..")).toContainText(
    testRootOutdated.runtime_version!,
  );
  const [draft] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "Report issue" }).click(),
  ]);
  await expect(draft.getByText("GitHub draft navigation intercepted by test")).toBeVisible();
  const url = new URL(draft.url());
  expect(url.searchParams.get("template")).toBe("bug_report.yml");
  expect(url.searchParams.get("model")).toBe("QE65LS03DAUXXU");
  const report = url.searchParams.get("diagnostics");
  expect(report).toContain("Rooted: Yes");
  expect(report).toContain(`Root helper version: ${testRootOutdated.runtime_version}`);
  expect(url.searchParams.get("versions")).toBe("Launcher: 3.0.0, CLI: 3.0.1, Tizen: 9.0.0");
  expect(report).not.toMatch(/192\.0\.2\.|Living room|Source:/);
  await draft.close();
});

test("discovers, saves and forgets a TV without an automatic connection after reload", async ({ page, isMobile }) => {
  await page.goto("/");
  const discovery = heldResponse();
  const connection = heldResponse();
  await page.exposeFunction("waitForTvResponse", (command: string) =>
    command === "discover_tvs" ? discovery.response : connection.response,
  );
  await page.evaluate(() => {
    const fixture = window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      waitForTvResponse(command: string): Promise<void>;
    };
    const invoke = fixture.__TAURI_INTERNALS__.invoke;
    fixture.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === "discover_tvs" || command === "connect_tv") await fixture.waitForTvResponse(command);
      return invoke(command, args);
    };
  });
  const title = page.getByRole("heading", { name: "Your TVs" });
  const results = page.getByRole("region", { name: "TVs on your network" });
  const search = results.getByRole("button", { name: "Search for TVs" });
  const enterAddress = results.getByRole("button", { name: "Enter IP address" });
  await expect(enterAddress).toBeEnabled();
  expect(await rightEdge(page.getByRole("button", { name: "Options for Living room" }))).toBeCloseTo(
    await rightEdge(enterAddress),
  );
  await expect(results.getByRole("button", { name: /^Connect to/ })).toHaveCount(0);
  await expect(search).toBeEnabled();
  const position = await title.boundingBox();
  const overlay = page.locator(".mantine-LoadingOverlay-root");
  try {
    await search.click();
    await expect(page.getByRole("status").filter({ hasText: "Searching your network…" })).toBeAttached();
    await expect(results).toHaveAttribute("aria-busy", "true");
    await expect(overlay).toHaveCount(0);
    expect(await title.boundingBox()).toEqual(position);
  } finally {
    discovery.release();
  }
  await expect(results.getByRole("button", { name: /^Connect to/ })).toHaveCount(1);
  const connectOffice = results.getByRole("button", { name: "Connect to Office at 192.0.2.22", exact: true });
  expect(await rightEdge(connectOffice)).toBeCloseTo(await rightEdge(enterAddress));
  try {
    await connectOffice.click();
    await expect(page.getByRole("status").filter({ hasText: "Connecting…" })).toBeAttached();
    await expect(overlay).toBeVisible();
    expect(await title.boundingBox()).toEqual(position);
  } finally {
    connection.release();
  }
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Toggle TV menu" }).click();
  await page.getByRole("button", { name: "Back to TVs" }).click();
  await expect(results).toBeVisible();
  await expect(search).toBeEnabled();
  await expect(results.getByRole("button", { name: /^Connect to/ })).toHaveCount(0);
  await expect(page.getByText("All TVs found are already saved.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your TVs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved TVs (3)" })).toBeVisible();
  await page.getByRole("button", { name: "Options for Office" }).click();
  await page.getByRole("menuitem", { name: "Forget TV" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Forget TV", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved TVs (2)" })).toBeVisible();
});
