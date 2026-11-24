import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { bedroom, livingRoom, testLocalApp, testService } from "./test/tvs";

async function openInstall(service = testService(), tv = livingRoom) {
  const user = userEvent.setup();
  render(
    <MantineProvider env="test">
      <App service={service} />
    </MantineProvider>,
  );
  await user.click(await screen.findByRole("button", { name: `Connect to ${tv.name}` }));
  await user.click(screen.getByRole("button", { name: "Apps" }));
  await user.click(screen.getByRole("button", { name: "Install from file" }));
  return { user, dialog: within(screen.getByRole("dialog", { name: "Install local app" })) };
}

describe("Local app installation", () => {
  it("reviews before installing and refreshes the app list after verified success", async () => {
    const service = testService();
    const install = vi.spyOn(service.localApps!, "install");
    const { user, dialog } = await openInstall(service);
    expect(dialog.getByRole("button", { name: "Install" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: "Choose .wgt file" }));
    expect(await dialog.findByText("Sample Player")).toBeVisible();
    expect(dialog.getByText("Version: 1.2.0")).toBeVisible();
    expect(dialog.getByText("Living room")).toBeVisible();
    expect(install).not.toHaveBeenCalled();
    await user.click(dialog.getByRole("button", { name: "Install" }));
    expect(
      (await screen.findByText("Sample Player 1.2.0 installed on Living room.")).closest('[role="status"]'),
    ).toBeVisible();
    expect(install).toHaveBeenCalledExactlyOnceWith(livingRoom.id, testLocalApp.selection_id, true);
    expect(screen.queryByRole("dialog", { name: "Install local app" })).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Sample Player" })).toBeEnabled();
  });

  it("keeps cancellation and invalid files free of install writes", async () => {
    const service = testService();
    vi.spyOn(service.localApps!, "choose")
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("This is not a valid Tizen .wgt app."));
    const install = vi.spyOn(service.localApps!, "install");
    const { user, dialog } = await openInstall(service);
    await user.click(dialog.getByRole("button", { name: "Choose .wgt file" }));
    expect(dialog.getByRole("button", { name: "Install" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: "Choose .wgt file" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("This is not a valid Tizen .wgt app.");
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(install).not.toHaveBeenCalled();
  });

  it("requires explicit replacement confirmation", async () => {
    const service = testService();
    vi.spyOn(service.localApps!, "choose").mockResolvedValue({
      ...testLocalApp,
      replacing: true,
      current_version: "2.0.0",
    });
    const install = vi.spyOn(service.localApps!, "install");
    const { user, dialog } = await openInstall(service);
    await user.click(dialog.getByRole("button", { name: "Choose .wgt file" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("This replaces the installed app (2.0.0).");
    expect(dialog.getByRole("button", { name: "Install" })).toBeDisabled();
    await user.click(dialog.getByRole("checkbox", { name: "Replace the installed app" }));
    expect(dialog.getByRole("button", { name: "Install" })).toBeEnabled();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(install).not.toHaveBeenCalled();
  });

  it("shows install errors in the dialog without claiming success", async () => {
    const service = testService();
    vi.spyOn(service.localApps!, "install").mockRejectedValue(new Error("The app file changed. Choose it again."));
    const { user, dialog } = await openInstall(service);
    await user.click(dialog.getByRole("button", { name: "Choose .wgt file" }));
    await user.click(await dialog.findByRole("button", { name: "Install" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("The app file changed. Choose it again.");
    expect(screen.queryByText("Sample Player 1.2.0 installed on Living room.")).not.toBeInTheDocument();
  });

  it("prepares Samsung certificates before installing on a new TV", async () => {
    const service = testService();
    const certificates = vi.spyOn(service.samsung!, "prepareCertificates");
    const install = vi.spyOn(service.localApps!, "install");
    const { user, dialog } = await openInstall(service, bedroom);
    await user.click(dialog.getByRole("button", { name: "Choose .wgt file" }));
    await user.click(await dialog.findByRole("button", { name: "Install" }));
    const setup = within(screen.getByRole("dialog", { name: "Set up Bedroom" }));
    expect(setup.getByText(/then install Sample Player/)).toBeVisible();
    expect(install).not.toHaveBeenCalled();
    await user.click(setup.getByRole("button", { name: "Sign in with Samsung" }));
    expect(await screen.findByText("Sample Player 1.2.0 installed on Bedroom.", {}, { timeout: 4000 })).toBeVisible();
    expect(screen.queryByText("Signed in to Samsung.")).not.toBeInTheDocument();
    expect(certificates).toHaveBeenCalledExactlyOnceWith(bedroom.id);
    expect(certificates).toHaveBeenCalledBefore(install);
  });
});
