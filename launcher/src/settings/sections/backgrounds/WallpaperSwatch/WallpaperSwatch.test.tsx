import { fireEvent, screen } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import type { BackgroundOption } from "../../../../contracts/launcher";
import { createNavigation } from "../../../../shared/navigation/createNavigation";
import { renderWithEnglish } from "../../../../test/renderWithEnglish";

import { WallpaperSwatch } from "./WallpaperSwatch";

const navigation = createNavigation(() => undefined);
vi.mock("../../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation }),
}));

test("shows the selection badge only on the selected wallpaper", () => {
  const background: BackgroundOption = { id: "black", preview: "black", requiresWebGL: false };
  const onSelect = vi.fn();
  const { rerender } = renderWithEnglish(
    <WallpaperSwatch background={background} hidden={false} onSelect={onSelect} selected />,
  );
  const button = screen.getByRole("button", { name: "Black", pressed: true });
  expect(button.querySelector("[data-selection-indicator] .lucide-check")).not.toBeNull();
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledTimes(1);

  rerender(<WallpaperSwatch background={background} hidden={false} onSelect={onSelect} selected={false} />);
  expect(
    screen.getByRole("button", { name: "Black", pressed: false }).querySelector("[data-selection-indicator]"),
  ).toBeNull();
});
