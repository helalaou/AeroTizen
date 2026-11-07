import { act, screen } from "@testing-library/preact";
import { expect, test } from "vitest";

import type { NetworkSnapshot } from "../../contracts/status";
import { createTestStatus } from "../../test/createTestStatus";
import { renderWithEnglish } from "../../test/renderWithEnglish";

import { NetworkStatus } from "./NetworkStatus";

const readings = [
  { kind: "wifi", strength: 0.2, glyph: "wifi-low", accessibleName: "Wi-Fi" },
  { kind: "wifi", strength: 0.5, glyph: "wifi-high", accessibleName: "Wi-Fi" },
  { kind: "wifi", strength: 1, glyph: "wifi", accessibleName: "Wi-Fi" },
  { kind: "wifi", strength: null, glyph: "wifi", accessibleName: "Wi-Fi (signal unavailable)" },
  { kind: "ethernet", strength: null, glyph: "ethernet-port", accessibleName: "Ethernet" },
  { kind: "offline", strength: null, glyph: "wifi-off", accessibleName: "Offline" },
  { kind: "unknown", strength: null, glyph: "globe", accessibleName: "Network status unavailable" },
] satisfies (Omit<NetworkSnapshot, "visible"> & { glyph: string; accessibleName: string })[];

test.each(readings)(
  "shows $glyph and labels $kind at strength $strength",
  ({ kind, strength, glyph, accessibleName }) => {
    const status = createTestStatus();
    status.network.set({ kind, strength, visible: true });
    renderWithEnglish(<NetworkStatus status={status} />);

    const icon = screen.getByRole("img", { name: accessibleName });
    expect(icon.classList.contains(`lucide-${glyph}`)).toBe(true);
    expect(icon.getAttribute("data-net-level")).toBe(strength === null ? "unknown" : String(strength));
  },
);

test("hidden network status stays out of the accessibility tree as the reading changes", async () => {
  const status = createTestStatus();
  status.network.set({ kind: "offline", strength: null, visible: false });
  renderWithEnglish(<NetworkStatus status={status} />);
  expect(screen.queryByRole("img")).toBeNull();

  await act(() => status.network.set({ kind: "ethernet", strength: null, visible: false }));
  expect(screen.queryByRole("img")).toBeNull();

  await act(() => status.network.set({ kind: "ethernet", strength: null, visible: true }));
  expect(screen.getByRole("img", { name: "Ethernet" })).toBeDefined();
});
