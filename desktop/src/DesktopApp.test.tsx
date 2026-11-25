import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { version } from "../package.json";
import { DesktopApp } from "./DesktopApp";
import { livingRoom, testService } from "./test/tvs";
import type { DesktopService } from "./contracts";

function mount(nativeService?: DesktopService) {
  return render(
    <MantineProvider env="test">
      <DesktopApp nativeService={nativeService} />
    </MantineProvider>,
  );
}

describe("Desktop app", () => {
  it("starts with the native service and waits for the user to select a TV", async () => {
    const service = testService();
    const connect = vi.spyOn(service, "connect");
    const user = userEvent.setup();
    mount(service);
    await waitFor(() => expect(screen.getByRole("button", { name: "Connect to Living room" })).toBeEnabled());
    expect(connect).not.toHaveBeenCalled();
    const actions = within(screen.getByRole("navigation", { name: "Desktop actions" }));
    expect(actions.getByRole("button", { name: "Sign in to Samsung" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "Logs" })).toBeVisible();
    await user.click(actions.getByRole("button", { name: "About AeroTizen" }));
    const about = within(screen.getByRole("dialog", { name: "About AeroTizen" }));
    expect(about.getByText(`Version ${version}`)).toBeVisible();
    expect(about.getByRole("link", { name: "AeroTizen on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/helalaou/AeroTizen",
    );
  });

  it("requires the native app in a browser", () => {
    mount();
    expect(screen.getByText("Open the desktop app to connect to your TV.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Search for TVs" })).not.toBeInTheDocument();
  });

  it("keeps Diagnostics open after a failed check and updates the results on retry", async () => {
    const service = testService();
    service.readHomeDiagnostics = vi.fn().mockResolvedValue({
      created_at: "2026-11-24T20:00:00Z",
      command: { action: "apply" },
      state: "rolled_back",
      host_failure_stage: "native_result",
      native_result: {
        Steps: [
          { Step: "verify_boot", Outcome: "failed", Differences: ["db/appfw/booting_appid_backup"] },
          { Step: "rollback", Outcome: "ok" },
        ],
      },
    });
    vi.spyOn(service, "connect").mockResolvedValueOnce({
      ...livingRoom,
      technical_details: { ...livingRoom.technical_details!, firmware_build: undefined },
    });
    const check = vi
      .spyOn(service, "checkDiagnostics")
      .mockRejectedValueOnce({ code: "connection_timeout", message: "The TV did not respond." })
      .mockResolvedValueOnce({
        ...livingRoom,
        native_home_settings: { ...livingRoom.native_home_settings!, startup_app: "DclHome001.Home" },
        launcher_eligibility: {
          state: "checked",
          launcher_registered: true,
          package_directory_visible: true,
          boot_check: "returned",
          boot_check_value: 0,
        },
      });
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    const sidebar = within(screen.getByRole("navigation", { name: "TV actions" }));
    await user.click(sidebar.getByRole("button", { name: "Diagnostics" }));
    expect(screen.getByText(/Unavailable settings include startup app/)).toBeVisible();
    expect(screen.getByText("Native Home mode")).toBeVisible();
    await user.click(screen.getByText("Technical details"));
    expect(screen.getByText("Firmware build").parentElement).toHaveTextContent("Unavailable");

    await user.click(screen.getByRole("button", { name: "Run checks" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The TV did not respond.");
    expect(screen.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    expect(screen.queryByText("Verified", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/Turn on the TV and check that it is on the same network/)).toBeVisible();
    expect(await screen.findByText("Setup failed. The TV restored the original settings.")).toBeVisible();
    await user.click(screen.getByText("TV setup steps (2)"));
    expect(screen.getByText(/Verify startup settings.*Failed/)).toHaveTextContent("db/appfw/booting_appid_backup");
    expect(screen.getByText(/Roll back changes.*OK/)).toBeVisible();
    expect(service.readHomeDiagnostics).toHaveBeenCalledWith(livingRoom.id);

    await user.click(screen.getByRole("button", { name: "Run checks" }));
    expect(await screen.findByText("The app read the current Home and startup settings.")).toBeVisible();
    expect(screen.getByText(/Launcher registered: yes.*Package directory visible: yes.*returned 0/)).toBeVisible();
    expect(screen.getByText("Firmware build").parentElement).toHaveTextContent("T-PTMDDEUC-0090-REL-202605141701");
    expect(check).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenLastCalledWith(livingRoom.id, expect.any(AbortSignal));

    const actions = within(screen.getByRole("navigation", { name: "Desktop actions" }));
    await user.click(actions.getByRole("button", { name: "Logs" }));
    expect(screen.getByRole("heading", { name: "Logs" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Desktop logs" })).toHaveTextContent("connection_timeout");
  });

  it("shows troubleshooting guidance when a TV cannot connect", async () => {
    const service = testService();
    vi.spyOn(service, "connect").mockRejectedValueOnce(new Error("Could not reach this TV."));
    const user = userEvent.setup();
    mount(service);
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    const feedback = await screen.findByRole("alert");
    expect(feedback).toHaveTextContent("Could not reach this TV.");
    expect(feedback).toHaveTextContent("If you use Developer Mode, set Host PC IP");
    expect(screen.getByRole("heading", { name: "Your TVs" })).toBeVisible();
  });

  it("offers Samsung setup when an install needs a signing profile", async () => {
    const service = testService();
    const profile = { ...livingRoom, launcher_signing_ready: false };
    const user = userEvent.setup();
    mount({ ...service, connect: async () => profile });
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    await user.click(await screen.findByRole("button", { name: "Update available" }));
    expect(screen.getByText("Signing certificates required")).toBeVisible();
    expect(screen.getByRole("button", { name: "Update to 3.1.0" })).toBeEnabled();
  });
});
