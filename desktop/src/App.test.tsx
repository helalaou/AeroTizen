import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DesktopService } from "./contracts";
import { testService } from "./test/tvs";

function mount(service: DesktopService = testService()) {
  return render(
    <MantineProvider env="test">
      <App service={service} />
    </MantineProvider>,
  );
}

describe("TV selection", () => {
  it("opens Overview and shows only Overview and Launcher in the TV menu", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Connect to Living room" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    const nav = within(screen.getByRole("navigation", { name: "TV actions" }));
    expect(nav.getAllByRole("button")).toHaveLength(2);
    expect(nav.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await user.click(nav.getByRole("button", { name: "Launcher" }));
    expect(screen.getByRole("heading", { name: "Launcher" })).toBeVisible();
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
