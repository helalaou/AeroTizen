import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { bedroom, livingRoom, testRootNotConfigured, testRootReady, testService } from "./test/tvs";

async function showRoot(service = testService(), tv = livingRoom) {
  const user = userEvent.setup();
  render(
    <MantineProvider env="test">
      <App service={service} />
    </MantineProvider>,
  );
  await user.click(await screen.findByRole("button", { name: `Connect to ${tv.name}` }));
  await user.click(screen.getByRole("button", { name: "Root access" }));
  return user;
}

describe("Root access", () => {
  it("confirms an update, resumes it after leaving the page and requires a new demo boot", async () => {
    const service = testService();
    const upgrade = vi.spyOn(service.rootAccess!, "upgrade");
    const setup = vi.spyOn(service.rootAccess!, "setup");
    const user = await showRoot(service);
    await user.click(await screen.findByRole("button", { name: "Update available" }));
    let dialog = within(screen.getByRole("dialog", { name: "Update root helper" }));
    expect(dialog.getByText("3.0.1", { exact: true })).toBeVisible();
    expect(dialog.getByRole("button", { name: "Update helper" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: "Close" }));
    expect(upgrade).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Update available" }));
    dialog = within(screen.getByRole("dialog", { name: "Update root helper" }));
    await user.click(dialog.getByRole("checkbox"));
    await user.click(dialog.getByRole("button", { name: "Update helper" }));
    expect(await dialog.findByText("Restart the TV to finish the update", {}, { timeout: 5000 })).toBeVisible();
    await user.click(dialog.getByRole("button", { name: "Check after restart" }));
    expect(await dialog.findByText(/update is not verified yet/)).toBeVisible();
    await user.click(dialog.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Launcher" }));
    await user.click(screen.getByRole("button", { name: "Root access" }));
    await user.click(await screen.findByRole("button", { name: "Continue update" }));
    dialog = within(screen.getByRole("dialog", { name: "Update root helper" }));
    await user.click(dialog.getByRole("button", { name: "Demo: restart TV" }));
    await user.click(dialog.getByRole("button", { name: "Check after restart" }));
    expect(await dialog.findByText(/Root helper 3.0.1 and automatic startup are verified/)).toBeVisible();
    await user.click(dialog.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Update available" })).not.toBeInTheDocument();
    expect(upgrade.mock.calls.map(([, action]) => action)).toEqual(["start", "resume", "resume"]);
    expect(setup).not.toHaveBeenCalled();
  }, 15000);

  it("can reload saved update progress after a lost installation reply", async () => {
    const service = testService();
    vi.spyOn(service.rootAccess!, "upgrade").mockRejectedValue(new Error("Update interrupted. Check saved progress."));
    const status = vi.spyOn(service.rootAccess!, "status");
    const user = await showRoot(service);
    await user.click(await screen.findByRole("button", { name: "Update available" }));
    const dialog = within(screen.getByRole("dialog", { name: "Update root helper" }));
    await user.click(dialog.getByRole("checkbox"));
    await user.click(dialog.getByRole("button", { name: "Update helper" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Update interrupted.");
    status.mockResolvedValue({ ...testRootReady, update_pending: true, root_available: false, setup_complete: false });
    await user.click(dialog.getByRole("button", { name: "Check saved progress" }));
    await user.click(await screen.findByRole("button", { name: "Continue update" }));
    const resume = within(screen.getByRole("dialog", { name: "Update root helper" }));
    expect(resume.getByText("If the update was interrupted")).toBeVisible();
    expect(resume.getByRole("button", { name: "Resume update" })).toBeEnabled();
  });

  it("reads live status and clears verified access when a refresh cannot confirm it", async () => {
    const service = testService();
    const status = vi.spyOn(service.rootAccess!, "status");
    const user = await showRoot(service);
    expect(await screen.findByRole("heading", { name: "Root access ready" })).toBeVisible();
    expect(status).toHaveBeenCalledWith(livingRoom.id, expect.any(AbortSignal));
    status.mockResolvedValue({
      ...testRootReady,
      root_available: false,
      setup_complete: false,
      runtime_version: null,
      automatic_startup: null,
      automatic_boot_verified: false,
      bootstrap_completed: false,
    });
    await user.click(screen.getByRole("button", { name: "Refresh root status" }));
    expect(await screen.findByRole("heading", { name: "Could not verify root access" })).toBeVisible();
    expect(screen.getByText("Unverified")).toBeVisible();
    expect(screen.queryByText("Root access ready")).not.toBeInTheDocument();
  });

  it("confirms, prepares signing, waits for an explicit demo restart and resumes the same setup", async () => {
    const service = testService();
    const setup = vi.spyOn(service.rootAccess!, "setup");
    const certificates = vi.spyOn(service.samsung!, "prepareCertificates");
    const installLauncher = vi.spyOn(service, "installLauncher");
    const user = await showRoot(service, bedroom);
    await user.click(await screen.findByRole("button", { name: "Set up root access" }));
    let wizard = within(screen.getByRole("dialog", { name: "Set up root access" }));
    expect(wizard.getByRole("button", { name: "Install root helper" })).toBeDisabled();
    await user.click(wizard.getByRole("button", { name: "Close" }));
    expect(setup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Set up root access" }));
    wizard = within(screen.getByRole("dialog", { name: "Set up root access" }));
    await user.click(wizard.getByRole("checkbox"));
    await user.click(wizard.getByRole("button", { name: "Install root helper" }));
    const signing = within(screen.getByRole("dialog", { name: "Set up Bedroom" }));
    expect(signing.getByText(/then install the root helper/)).toBeVisible();
    await user.click(signing.getByRole("button", { name: "Sign in with Samsung" }));
    wizard = within(await screen.findByRole("dialog", { name: "Set up root access" }, { timeout: 5000 }));
    expect(wizard.getByText("Restart the TV to finish setup")).toBeVisible();
    expect(certificates).toHaveBeenCalledBefore(setup);
    await user.click(wizard.getByRole("button", { name: "Check after restart" }));
    expect(await wizard.findByText(/has not confirmed automatic root access/)).toBeVisible();
    expect(screen.queryByText("Root access ready")).not.toBeInTheDocument();
    await user.click(wizard.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Launcher" }));
    await user.click(screen.getByRole("button", { name: "Root access" }));
    await user.click(await screen.findByRole("button", { name: "Continue setup" }));
    wizard = within(screen.getByRole("dialog", { name: "Set up root access" }));
    await user.click(wizard.getByRole("button", { name: "Demo: restart TV" }));
    await user.click(wizard.getByRole("button", { name: "Check after restart" }));
    expect(await wizard.findByText(/Root access and automatic startup are verified/)).toBeVisible();
    await user.click(wizard.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { name: "Root access ready" })).toBeVisible();
    expect(setup.mock.calls.map(([, action]) => action)).toEqual(["start", "verify", "verify"]);
    expect(certificates).toHaveBeenCalledExactlyOnceWith(bedroom.id);
    await user.click(screen.getByRole("button", { name: "Launcher" }));
    await user.click(screen.getByRole("button", { name: "Install 3.1.0" }));
    await waitFor(() => expect(installLauncher).toHaveBeenCalledOnce());
    expect(certificates).toHaveBeenCalledExactlyOnceWith(bedroom.id);
  }, 15000);

  it("cancels a status read when leaving the tab and leaves navigation enabled", async () => {
    const service = testService();
    let pending: AbortSignal | undefined;
    vi.spyOn(service.rootAccess!, "status").mockImplementation(
      (_id, signal) =>
        new Promise((_resolve, reject) => {
          pending = signal;
          signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
        }),
    );
    const user = await showRoot(service);
    expect(await screen.findByText("Checking root access…")).toBeInTheDocument();
    const launcher = screen.getByRole("button", { name: "Launcher" });
    expect(launcher).toBeEnabled();
    await user.click(launcher);
    await waitFor(() => expect(pending?.aborted).toBe(true));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps setup errors in the dialog and can reload saved partial progress", async () => {
    const service = testService();
    const connect = service.connect;
    vi.spyOn(service, "connect").mockImplementation(async (...args) => ({
      ...(await connect(...args)),
      launcher_signing_ready: true,
    }));
    vi.spyOn(service.rootAccess!, "setup").mockRejectedValue(new Error("Setup was interrupted. Check saved progress."));
    const status = vi.spyOn(service.rootAccess!, "status");
    const user = await showRoot(service, bedroom);
    await user.click(await screen.findByRole("button", { name: "Set up root access" }));
    const wizard = within(screen.getByRole("dialog", { name: "Set up root access" }));
    await user.click(wizard.getByRole("checkbox"));
    await user.click(wizard.getByRole("button", { name: "Install root helper" }));
    expect(await wizard.findByRole("alert")).toHaveTextContent("Setup was interrupted.");
    status.mockResolvedValue({ ...testRootNotConfigured, phase: "installed", recovery_saved: true });
    await user.click(wizard.getByRole("button", { name: "Check saved progress" }));
    expect(await screen.findByRole("heading", { name: "Setup interrupted" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue setup" })).toBeEnabled();
  });
});
