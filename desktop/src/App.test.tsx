import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DesktopService } from "./contracts";
import {
  bedroom,
  livingRoom,
  office,
  testBackupSha256,
  testButtonMappings,
  testPackages,
  testReleases,
  testService,
} from "./test/tvs";

function mount(service: DesktopService = testService()) {
  return render(
    <MantineProvider env="test">
      <App service={service} />
    </MantineProvider>,
  );
}

describe("Launcher releases and button names", () => {
  it("checks Home before offering removal and requires a separate confirmation", async () => {
    const service = testService();
    const review = vi.spyOn(service, "reviewLauncherRemoval").mockRejectedValueOnce({
      code: "launcher_home_assigned",
      message: "AeroTizen is still assigned to Home or startup.",
    });
    const remove = vi.spyOn(service, "removeLauncher");
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    const sidebar = within(screen.getByRole("navigation", { name: "TV actions" }));
    await user.click(sidebar.getByRole("button", { name: "Install & update" }));

    await user.click(screen.getByRole("button", { name: "Remove AeroTizen" }));
    const dialog = within(screen.getByRole("dialog", { name: "Remove AeroTizen" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("AeroTizen is still assigned");
    expect(dialog.queryByRole("button", { name: "Remove AeroTizen" })).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Open Home and startup" }));
    expect(screen.getByRole("heading", { name: "Home and startup" })).toBeVisible();
    expect(remove).not.toHaveBeenCalled();

    await user.click(sidebar.getByRole("button", { name: "Install & update" }));
    await user.click(screen.getByRole("button", { name: "Remove AeroTizen" }));
    expect(await screen.findByText("This deletes AeroTizen and its settings from this TV.")).toBeVisible();
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove AeroTizen" }));
    const confirmation = await within(screen.getByRole("dialog", { name: "Remove AeroTizen" })).findByRole("button", {
      name: "Remove AeroTizen",
    });
    await user.click(confirmation);
    expect(await screen.findByRole("heading", { name: "AeroTizen is not installed" })).toBeVisible();
    expect(review).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledExactlyOnceWith(livingRoom.id, testBackupSha256, true);
  });

  it("refreshes published releases without hiding the current release or blocking navigation", async () => {
    const service = testService();
    const catalog = vi.spyOn(service, "launcherCatalog");
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(screen.getByRole("button", { name: "Install & update" }));
    expect(await screen.findByRole("heading", { name: "Version 3.1.0" })).toBeVisible();
    let finish!: (value: typeof testReleases) => void;
    catalog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh releases" }));
    expect(screen.getByRole("button", { name: "Refresh releases" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update to 3.1.0" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Version 3.1.0" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Overview" })).toBeEnabled();
    finish([{ ...testReleases[0]!, version: "3.2.0" }, ...testReleases]);
    expect(await screen.findByRole("button", { name: "Update to 3.2.0" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Version 3.2.0" })).toBeVisible();
    expect(catalog).toHaveBeenCalledTimes(2);
    catalog.mockRejectedValueOnce(new Error("Offline"));
    await user.click(screen.getByRole("button", { name: "Refresh releases" }));
    expect(await screen.findByRole("heading", { name: "Couldn’t check for updates" })).toBeVisible();
    expect(screen.getByText("On this TV: 3.0.0")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "AeroTizen is up to date" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Update to 3.1.0" })).toBeEnabled();
  });

  it("renames a button without changing its assigned app and keeps errors in the dialog", async () => {
    const service = testService();
    const change = vi
      .spyOn(service.buttonActions!, "updateInventory")
      .mockRejectedValueOnce(new Error("Update root access to rename app buttons."));
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(screen.getByRole("button", { name: "Button mapping" }));
    await user.click(await screen.findByRole("button", { name: "Actions for Netflix" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    let dialog = within(screen.getByRole("dialog", { name: "Rename Netflix" }));
    expect(dialog.getByRole("button", { name: "Save name" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Actions for Netflix" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    dialog = within(screen.getByRole("dialog", { name: "Rename Netflix" }));
    const name = dialog.getByRole("textbox", { name: "Button name" });
    await user.clear(name);
    expect(dialog.getByRole("button", { name: "Save name" })).toBeDisabled();
    await user.type(name, "prime video");
    expect(dialog.getByText("A button already has this name.")).toBeVisible();
    await user.clear(name);
    await user.type(name, "Streaming");
    await user.click(dialog.getByRole("button", { name: "Save name" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Update root access");
    expect(name).toHaveValue("Streaming");
    await user.click(dialog.getByRole("button", { name: "Save name" }));
    const row = await screen.findByRole("row", { name: /Streaming/ });
    expect(row).toHaveTextContent("Stremio");
    expect(row).toHaveTextContent("Active");
    expect(screen.queryByRole("row", { name: /Netflix/ })).not.toBeInTheDocument();
    expect(change).toHaveBeenLastCalledWith(livingRoom.id, {
      action: "rename",
      button: "Netflix",
      new_name: "Streaming",
    });
  });
});

describe("Home and startup", () => {
  it("prepares the original backup before applying Native Home", async () => {
    const user = userEvent.setup();
    const service = testService();
    const prepare = vi.spyOn(service, "prepareNativeHome");
    const apply = vi.spyOn(service, "applyNativeHome");
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Search for TVs" }));
    await user.click(await screen.findByRole("button", { name: "Connect to Office at 192.0.2.22" }));
    await user.click(await screen.findByRole("button", { name: "Home and startup" }));
    const applyButton = screen.getByRole("button", { name: "Use AeroTizen for Home and startup" });
    await user.click(applyButton);
    let review = within(screen.getByRole("dialog", { name: "Use AeroTizen for Home and startup?" }));
    expect(review.getByText("Office")).toBeVisible();
    await user.click(review.getByRole("button", { name: "Cancel" }));
    expect(prepare).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "AeroTizen reopens after Samsung Home" })).toBeVisible();

    await user.click(applyButton);
    review = within(screen.getByRole("dialog", { name: "Use AeroTizen for Home and startup?" }));
    await user.click(review.getByRole("button", { name: "Confirm setup" }));
    expect(await screen.findByRole("heading", { name: "AeroTizen opens directly" })).toBeVisible();
    expect(prepare).toHaveBeenCalledExactlyOnceWith(office.id);
    expect(apply).toHaveBeenCalledExactlyOnceWith(office.id, testBackupSha256);
    expect(prepare).toHaveBeenCalledBefore(apply);
    expect(applyButton).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore original settings…" }));
    const backup = within(screen.getByRole("dialog", { name: "Original Home backup" }));
    expect(backup.getByText(/Original backup saved/)).toBeVisible();
    expect(await backup.findByRole("button", { name: "Restore original settings" })).toBeEnabled();
  });

  it("can prepare a backup before the launcher starts and stops Apply if preparation fails", async () => {
    const user = userEvent.setup();
    const service = testService();
    const connect = service.connect;
    vi.spyOn(service, "connect").mockImplementation(async (...args) => ({
      ...(await connect(...args)),
      home_routing_mode: undefined,
    }));
    const prepare = vi
      .spyOn(service, "prepareNativeHome")
      .mockRejectedValueOnce(new Error("Backup could not be saved."));
    const apply = vi.spyOn(service, "applyNativeHome");
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Search for TVs" }));
    await user.click(await screen.findByRole("button", { name: "Connect to Office at 192.0.2.22" }));
    await user.click(await screen.findByRole("button", { name: "Home and startup" }));
    await user.click(screen.getByRole("button", { name: "Use AeroTizen for Home and startup" }));
    const review = within(screen.getByRole("dialog", { name: "Use AeroTizen for Home and startup?" }));
    await user.click(review.getByRole("button", { name: "Confirm setup" }));
    expect(await review.findByRole("alert")).toHaveTextContent("Backup could not be saved.");
    expect(prepare).toHaveBeenCalledExactlyOnceWith(office.id);
    expect(apply).not.toHaveBeenCalled();
  });

  it("allows cancellation, reports a restore failure, and updates the TV after a confirmed retry", async () => {
    const user = userEvent.setup();
    const service = testService();
    const restore = vi.spyOn(service, "restoreHomeBackup").mockRejectedValueOnce(new Error("TV disconnected."));
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(await screen.findByRole("button", { name: "Home and startup" }));
    await user.click(screen.getByRole("button", { name: "Restore original settings…" }));
    const backup = within(screen.getByRole("dialog", { name: "Original Home backup" }));
    await user.click(await backup.findByRole("button", { name: "Restore original settings" }));
    const review = within(screen.getByRole("dialog", { name: "Restore original settings?" }));
    expect(review.getByText("Living room")).toBeVisible();
    expect(review.getAllByText("Samsung Home")).toHaveLength(3);
    expect(review.getAllByText("TV viewer")).toHaveLength(2);
    expect(review.getByText("Off")).toBeVisible();
    expect(restore).not.toHaveBeenCalled();
    await user.click(review.getByRole("button", { name: "Cancel" }));
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "AeroTizen opens directly" })).toBeVisible();
    await user.click(await backup.findByRole("button", { name: "Restore original settings" }));
    await user.click(review.getByRole("button", { name: "Confirm restore" }));
    expect(await review.findByRole("alert")).toHaveTextContent("TV disconnected.");

    await user.click(review.getByRole("button", { name: "Confirm restore" }));
    expect(await screen.findByText("Original Home and startup settings restored.")).toBeVisible();
    expect(restore).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenLastCalledWith(
      livingRoom.id,
      livingRoom.home_backup?.status === "saved" ? livingRoom.home_backup.captured_at : undefined,
    );
    expect(screen.queryByRole("dialog", { name: "Restore original settings?" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AeroTizen reopens after Samsung Home" })).toBeVisible();
    const current = within(screen.getByRole("region", { name: "Current settings" }));
    expect(current.getByText("Home button").parentElement).toHaveTextContent("Samsung Home");
  });

  it("offers no restore action when there is no backup", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Connect to Bedroom" }));
    await user.click(await screen.findByRole("button", { name: "Home and startup" }));
    expect(screen.getByText("No original Home backup found on this computer.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Restore original settings/ })).not.toBeInTheDocument();
  });
});

describe("TV selection", () => {
  it("opens Overview and shows the TV actions", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    const nav = within(screen.getByRole("navigation", { name: "TV actions" }));
    expect(nav.getByRole("button", { name: "Apps" })).toBeVisible();
    expect(nav.getByRole("button", { name: "Home and startup" })).toBeVisible();
    expect(nav.getByRole("button", { name: "Button mapping" })).toBeVisible();
    expect(nav.getByRole("button", { name: "Root access" })).toBeVisible();
    expect(nav.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await user.click(nav.getByRole("button", { name: "Install & update" }));
    expect(screen.getByRole("heading", { name: "Install & update" })).toBeVisible();
  });

  it("opens Root access when button mapping needs verified root", async () => {
    const service = testService();
    vi.spyOn(service, "listButtons").mockResolvedValue({ status: "pairing_required" });
    const setup = vi.spyOn(service.rootAccess!, "setup");
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Bedroom" }));
    await user.click(screen.getByRole("button", { name: "Button mapping" }));
    expect(await screen.findByRole("heading", { name: "Root access required" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open Root access" }));
    expect(screen.getByRole("heading", { name: "Root access", level: 1 })).toBeVisible();
    expect(setup).not.toHaveBeenCalled();
  });

  it("cancels the button read when leaving the page and reloads current mappings on return", async () => {
    const user = userEvent.setup();
    const service = testService();
    const listButtons = vi.spyOn(service, "listButtons").mockImplementationOnce(
      (_id, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    const nav = await screen.findByRole("navigation", { name: "TV actions" });
    const view = within(nav).getByRole("button", { name: "Button mapping" });
    await user.click(view);
    expect(await screen.findByRole("status", { name: "Loading button mappings" })).toBeVisible();
    await user.click(within(nav).getByRole("button", { name: "Install & update" }));
    expect(screen.getByRole("heading", { name: "Install & update" })).toBeVisible();
    expect(listButtons.mock.calls.at(0)?.[1].aborted).toBe(true);
    listButtons.mockResolvedValueOnce(testButtonMappings);
    await user.click(view);
    expect(await screen.findByRole("table", { name: "Remote app buttons" })).toBeVisible();
    expect(screen.getByText("Stremio")).toBeVisible();
    expect(listButtons).toHaveBeenCalledTimes(2);
  });

  it("keeps the selected app in the picker when saving fails and allows a retry", async () => {
    const user = userEvent.setup();
    const service = testService();
    const actions = service.buttonActions;
    if (!actions) throw new Error("The fixture must support button actions.");
    const save = vi.spyOn(actions, "change").mockRejectedValueOnce(new Error("The TV could not save this mapping."));
    const reads = vi.spyOn(service, "listButtons");
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(await screen.findByRole("button", { name: "Button mapping" }));
    const row = within(await screen.findByRole("row", { name: /Netflix/ }));
    await user.click(row.getByRole("button", { name: "Actions for Netflix" }));
    await user.click(await screen.findByRole("menuitem", { name: "Choose app" }));
    const dialog = within(screen.getByRole("dialog", { name: "Choose an app for Netflix" }));
    const search = dialog.getByRole("combobox", { name: "Installed app" });
    await user.clear(search);
    await user.type(search, "YouT");
    await user.click(await dialog.findByRole("option", { name: "YouTube" }));
    const assign = dialog.getByRole("button", { name: "Assign app" });
    await user.click(assign);
    expect(await dialog.findByRole("alert")).toHaveTextContent("The TV could not save this mapping.");
    expect(search).toHaveValue("YouTube");
    await user.click(assign);
    expect(await row.findByText("YouTube")).toBeVisible();
    expect(await row.findByText("Checking…")).toBeVisible();
    expect(screen.queryByText("Netflix now opens YouTube.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Change saved\. Checking/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading button mappings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install & update" })).toBeEnabled();
    expect(await row.findByText("Active", {}, { timeout: 4000 })).toBeVisible();
    expect(await screen.findByText("Netflix now opens YouTube.")).toBeVisible();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(livingRoom.id, { button: "Netflix", mode: "app", app_id: "test.YouTube" });
    const readCount = reads.mock.calls.length;
    await user.click(row.getByRole("button", { name: "Actions for Netflix" }));
    await user.click(await screen.findByRole("menuitem", { name: "Restore original action" }));
    expect(await row.findByText("Original action")).toBeVisible();
    expect(row.queryByText("Checking…")).not.toBeInTheDocument();
    expect(reads).toHaveBeenCalledTimes(readCount);
  });

  it("keeps a saved change visible when its activation check fails", async () => {
    const service = testService();
    const reads = vi
      .spyOn(service, "listButtons")
      .mockResolvedValueOnce(testButtonMappings)
      .mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(screen.getByRole("button", { name: "Button mapping" }));
    const row = within(await screen.findByRole("row", { name: /Netflix/ }));
    await user.click(row.getByRole("button", { name: "Actions for Netflix" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disable" }));
    expect(await row.findByText("Checking…")).toBeVisible();
    expect(await row.findByText("Not confirmed", {}, { timeout: 3000 })).toBeVisible();
    expect(row.getByText("Disabled")).toBeVisible();
    expect(screen.queryByText(/Changes marked Not confirmed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("cancels an activation check before loading another app choice", async () => {
    const service = testService();
    let checkingSignal: AbortSignal | undefined;
    vi.spyOn(service, "listButtons")
      .mockResolvedValueOnce(testButtonMappings)
      .mockImplementationOnce(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            checkingSignal = signal;
            signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
          }),
      );
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(screen.getByRole("button", { name: "Button mapping" }));
    const row = within(await screen.findByRole("row", { name: /Netflix/ }));
    await user.click(row.getByRole("button", { name: "Actions for Netflix" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disable" }));
    await waitFor(() => expect(checkingSignal).toBeDefined(), { timeout: 3000 });
    await user.click(row.getByRole("button", { name: "Actions for Netflix" }));
    await user.click(await screen.findByRole("menuitem", { name: "Choose app" }));
    const picker = within(screen.getByRole("dialog", { name: "Choose an app for Netflix" }));
    await waitFor(() => expect(picker.getByRole("combobox", { name: "Installed app" })).toBeEnabled());
    expect(checkingSignal?.aborted).toBe(true);
    await user.click(picker.getByRole("button", { name: "Cancel" }));
    expect(row.getByText("Disabled")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels an app list fetch when leaving Apps and starts a fresh request on return", async () => {
    const service = testService();
    let finishLoad: () => void = () => {
      throw new Error("The app list did not start loading.");
    };
    const listApps = vi.spyOn(service, "listApps").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLoad = () => resolve(testPackages);
        }),
    );
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await screen.findByRole("heading", { name: "Overview" });
    const nav = within(screen.getByRole("navigation", { name: "TV actions" }));
    await user.click(nav.getByRole("button", { name: "Apps" }));
    const refreshApps = () => screen.getByRole("button", { name: "Refresh apps" });
    expect(refreshApps()).toBeDisabled();
    expect(listApps).toHaveBeenCalledTimes(1);
    await user.click(nav.getByRole("button", { name: "Install & update" }));
    expect(screen.getByRole("heading", { name: "Install & update" })).toBeVisible();
    expect(screen.getByRole("button", { name: "3.1.0, Latest release" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Update to 3.1.0" })).toBeEnabled();
    expect(listApps.mock.calls.at(0)?.[1].aborted).toBe(true);
    await user.click(nav.getByRole("button", { name: "Apps" }));
    expect(screen.getByRole("button", { name: "Remove selected" })).toBeDisabled();
    expect(listApps).toHaveBeenCalledTimes(1);
    listApps.mockResolvedValueOnce(testPackages.slice(0, 1));
    finishLoad();
    expect(await screen.findByText("1 package")).toBeVisible();
    expect(listApps).toHaveBeenCalledTimes(2);

    await user.click(refreshApps());
    expect(await screen.findByText(`${testPackages.length} packages`)).toBeVisible();
    expect(listApps).toHaveBeenCalledTimes(3);
  });

  it("requires a successful connection to open and refresh a saved TV", async () => {
    const service = testService();
    const connect = vi.spyOn(service, "connect");
    const user = userEvent.setup();
    mount(service);
    const connectButton = () => screen.getByRole("button", { name: "Connect to Living room" });
    await waitFor(() => expect(connectButton()).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Options for Living room" }));
    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "View saved details" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    connect.mockRejectedValueOnce(new Error("TV unavailable"));
    await user.click(connectButton());
    expect(await screen.findByText("TV unavailable")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
    await user.click(connectButton());
    await screen.findByRole("heading", { name: "Overview" });
    connect.mockRejectedValueOnce(new Error("TV unavailable"));
    await user.click(screen.getByRole("button", { name: "Refresh TV connection" }));
    expect(await screen.findByText("TV unavailable")).toBeVisible();
    expect(connectButton()).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
    await user.click(connectButton());
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
  });
  it("starts with only saved TVs, then connects and returns to the selection view", async () => {
    const service = testService();
    const connect = vi.spyOn(service, "connect");
    const user = userEvent.setup();
    mount(service);
    expect(await screen.findByRole("heading", { name: "Your TVs" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Connect to Living room" })).toBeEnabled());
    expect(connect).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect to Living room" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(connect).toHaveBeenCalledWith("192.0.2.20", "1".repeat(64));
    await user.click(screen.getByRole("button", { name: "Back to TVs" }));
    expect(screen.getByRole("heading", { name: "Your TVs" })).toBeVisible();
  });

  it("keeps manual connection failures visible inside the dialog", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter IP address" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Enter IP address" }));
    await user.type(screen.getByRole("textbox", { name: "TV IP address" }), "192.0.2.99");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Connect" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "Could not connect to the TV.",
    );
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
  });

  it("saves a newly discovered TV and persists names across app reloads", async () => {
    const service = testService();
    const user = userEvent.setup();
    const view = mount(service);
    await waitFor(() => expect(screen.getByRole("button", { name: "Search for TVs" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Search for TVs" }));
    await user.click(await screen.findByRole("button", { name: "Connect to Office at 192.0.2.22" }));
    await screen.findByRole("heading", { name: "Overview" });
    await user.click(screen.getByRole("button", { name: "Back to TVs" }));
    await user.click(screen.getByRole("button", { name: "Options for Office" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "TV name" }), { target: { value: "Study" } });
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    view.unmount();
    mount(service);
    expect(await screen.findByRole("button", { name: "Connect to Study" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Saved TVs (3)" })).toBeVisible();
  });
});

describe("Samsung setup", () => {
  it("cancels the pending browser sign-in from the menu", async () => {
    const user = userEvent.setup();
    const service = testService();
    const samsung = service.samsung;
    if (!samsung) throw new Error("The fixture must support Samsung sign-in.");
    const signIn = vi.spyOn(samsung, "signIn").mockImplementation(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    mount(service);
    await screen.findByRole("heading", { name: "Your TVs" });
    await user.click(screen.getByRole("button", { name: "App menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign in to Samsung" }));
    const dialog = within(screen.getByRole("dialog", { name: "Samsung sign-in" }));
    await user.click(dialog.getByRole("button", { name: "Sign in with Samsung" }));
    expect(dialog.getByRole("status")).toHaveTextContent("Complete Samsung sign-in in your browser.");
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(signIn.mock.calls[0]?.[0].aborted).toBe(true);
    expect(await samsung.account()).toBeNull();
  });

  it("stops before install if certificates fail and uses an existing sign-in for the retry", async () => {
    const user = userEvent.setup();
    const service = testService();
    const samsung = service.samsung;
    if (!samsung) throw new Error("The fixture must support Samsung sign-in.");
    const signIn = vi.spyOn(samsung, "signIn");
    const certificates = vi
      .spyOn(samsung, "prepareCertificates")
      .mockRejectedValueOnce(new Error("Samsung could not issue the certificates."))
      .mockResolvedValue({ identity_sha256: bedroom.id, launcher_signing_ready: true });
    const install = vi.spyOn(service, "installLauncher").mockImplementation(async () => ({
      ...bedroom,
      launcher_version: "3.1.0",
      launcher_signing_ready: true,
    }));
    vi.spyOn(samsung, "account").mockResolvedValue({ email: "demo@example.com" });
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Bedroom" }));
    await user.click(await screen.findByRole("button", { name: "Install & update" }));
    await user.click(screen.getByRole("button", { name: "Install 3.1.0" }));
    const dialog = within(screen.getByRole("dialog", { name: "Set up Bedroom" }));
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Samsung could not issue the certificates.");
    expect(install).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("AeroTizen 3.1.0 installed.")).toBeVisible();
    expect(certificates).toHaveBeenCalledTimes(2);
    expect(install).toHaveBeenCalledExactlyOnceWith(bedroom.id, "3.1.0", null, false);
    expect(signIn).not.toHaveBeenCalled();
  });
});
