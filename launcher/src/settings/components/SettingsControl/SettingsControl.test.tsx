import { act, fireEvent, render, screen } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import { createNavigation } from "../../../shared/navigation/createNavigation";

import { SettingsControl } from "./SettingsControl";

const navigation = createNavigation(() => undefined);

vi.mock("../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation }),
}));

test("navigation and clicks update only the selected control's focus state", async () => {
  const firstLabel = "First";
  const secondLabel = "Second";
  render(
    <>
      <SettingsControl focusKey="first" role="button">
        {firstLabel}
      </SettingsControl>
      <SettingsControl focusKey="second" role="button">
        {secondLabel}
      </SettingsControl>
    </>,
  );
  const first = screen.getByRole("button", { name: firstLabel });
  const second = screen.getByRole("button", { name: secondLabel });
  await act(() => navigation.select("first"));
  expect(first.getAttribute("data-focused")).toBe("true");
  expect(document.activeElement).toBe(first);
  fireEvent.click(second);
  expect(first.getAttribute("data-focused")).toBeNull();
  expect(second.getAttribute("data-focused")).toBe("true");
  expect(document.activeElement).toBe(second);
  await act(() => navigation.clear());
  expect(second.getAttribute("data-focused")).toBeNull();
});
