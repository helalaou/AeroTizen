import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createSimulatorStore } from "./store";
import { SimulatorControls } from "./SimulatorControls";

it("edits a TV, rejects duplicate addresses and applies visibility switches before reloading", async () => {
  const store = createSimulatorStore();
  const onReload = vi.fn();
  const user = userEvent.setup();
  render(
    <MantineProvider env="test">
      <SimulatorControls store={store} onReload={onReload} />
    </MantineProvider>,
  );
  await user.click(screen.getByRole("button", { name: "TV simulator" }));
  const dialog = within(screen.getByRole("dialog", { name: "TV simulator" }));
  const name = dialog.getByRole("textbox", { name: "TV name" });
  await user.clear(name);
  await user.type(name, "Kitchen TV");
  const host = dialog.getByRole("textbox", { name: "IP address" });
  await user.clear(host);
  await user.type(host, "192.0.2.21");
  await user.click(dialog.getByRole("button", { name: "Save and reload preview" }));
  expect(dialog.getByRole("alert")).toHaveTextContent("unique IPv4");
  expect(onReload).not.toHaveBeenCalled();
  await user.clear(host);
  await user.type(host, "192.0.2.44");
  await user.click(dialog.getByRole("checkbox", { name: "TV is online" }));
  await user.click(dialog.getByRole("checkbox", { name: "Show in saved TVs" }));
  await user.click(dialog.getByRole("checkbox", { name: "Find in network search" }));
  await user.click(dialog.getByRole("button", { name: "Save and reload preview" }));
  expect(store.getSnapshot().tvs[0]).toMatchObject({
    profile: { name: "Kitchen TV", host: "192.0.2.44" },
    online: false,
    saved: false,
    discoverable: false,
  });
  expect(onReload).toHaveBeenCalledOnce();
});

it("uses GitHub by default and requires an explicit choice to load sample releases", async () => {
  const store = createSimulatorStore();
  const onReload = vi.fn();
  const user = userEvent.setup();
  render(
    <MantineProvider env="test">
      <SimulatorControls store={store} onReload={onReload} />
    </MantineProvider>,
  );
  await user.click(screen.getByRole("button", { name: "TV simulator" }));
  const dialog = within(screen.getByRole("dialog", { name: "TV simulator" }));
  await user.click(dialog.getByRole("tab", { name: "Releases" }));
  expect(dialog.getByRole("combobox", { name: "Launcher release source" })).toHaveValue("github");
  expect(store.getSnapshot().releases).toEqual([]);
  await user.click(dialog.getByRole("button", { name: "Use sample releases" }));
  expect(store.getSnapshot().release_source).toBe("custom");
  expect(store.getSnapshot().releases.length).toBeGreaterThan(0);
  expect(onReload).toHaveBeenCalledOnce();
});
