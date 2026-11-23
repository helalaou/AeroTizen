import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    await user.click(screen.getByRole("button", { name: "App menu" }));
    expect(await screen.findByRole("menuitem", { name: "About AeroTizen" })).toBeVisible();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "Sign in to Samsung" })).toBeVisible();
  });

  it("requires the native app in a browser", () => {
    mount();
    expect(screen.getByText("Open the desktop app to connect to your TV.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Search for TVs" })).not.toBeInTheDocument();
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
