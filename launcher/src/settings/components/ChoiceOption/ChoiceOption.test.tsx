import { fireEvent, render, screen } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import { createNavigation } from "../../../shared/navigation/createNavigation";

import { ChoiceOption } from "./ChoiceOption";

const navigation = createNavigation(() => undefined);

vi.mock("../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation }),
}));

test("exposes its selection state and calls onSelect when clicked", () => {
  const label = "24-hour time";
  const onSelect = vi.fn();
  const { rerender } = render(
    <ChoiceOption id="time:24" onSelect={onSelect}>
      {label}
    </ChoiceOption>,
  );

  const option = screen.getByRole("button", { name: label, pressed: false });
  fireEvent.click(option);
  expect(onSelect).toHaveBeenCalledTimes(1);

  rerender(
    <ChoiceOption id="time:24" onSelect={onSelect} selected>
      {label}
    </ChoiceOption>,
  );
  expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
});
