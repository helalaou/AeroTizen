import { fireEvent, screen } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import english from "../../../shared/i18n/en.json";
import { createNavigation } from "../../../shared/navigation/createNavigation";
import { renderWithEnglish } from "../../../test/renderWithEnglish";

import { SettingsToggle } from "./SettingsToggle";

const navigation = createNavigation(() => undefined);

vi.mock("../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation }),
}));

test("keeps its accessible name while its state changes and requests the opposite value", () => {
  const label = english["weather.show"];
  const onChange = vi.fn();
  const { rerender } = renderWithEnglish(
    <SettingsToggle focusKey="weather-display" label={label} checked={false} onChange={onChange} />,
  );
  const control = screen.getByRole("switch", { name: label, checked: false });
  expect(screen.getByText("Off")).toBeTruthy();
  fireEvent.click(control);
  expect(onChange).toHaveBeenLastCalledWith(true);
  expect(document.activeElement).toBe(control);

  rerender(<SettingsToggle focusKey="weather-display" label={label} checked onChange={onChange} />);
  expect(screen.getByRole("switch", { name: label, checked: true })).toBe(control);
  expect(screen.getByText("On")).toBeTruthy();
  fireEvent.click(control);
  expect(onChange).toHaveBeenLastCalledWith(false);
  expect(onChange).toHaveBeenCalledTimes(2);
});

test("exposes disabled state without changing its saved value", () => {
  const onChange = vi.fn();
  renderWithEnglish(
    <SettingsToggle focusKey="weather-display" label={english["weather.show"]} checked disabled onChange={onChange} />,
  );
  const control = screen.getByRole("switch", { name: "Show weather", checked: true });
  expect(control.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(control);
  expect(onChange).not.toHaveBeenCalled();
});
