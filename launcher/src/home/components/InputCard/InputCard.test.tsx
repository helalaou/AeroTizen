import { screen } from "@testing-library/preact";
import { expect, test } from "vitest";

import { renderWithEnglish } from "../../../test/renderWithEnglish";
import { createCardEnvironment } from "../../test/createCardEnvironment";

import { InputCard } from "./InputCard";

test.each([
  { type: "TV", inputName: "Live TV", glyph: "tv" },
  { type: "HDMI", inputName: "Xbox", glyph: "gamepad-2" },
  { type: "HDMI", inputName: "PC", glyph: "monitor" },
  { type: "HDMI", inputName: "Apple TV", glyph: "rectangle-ellipsis" },
  { type: "HDMI", inputName: "HDMI 4", glyph: "hdmi-port" },
])("renders the $glyph icon for $inputName", ({ type, inputName, glyph }) => {
  const source = { type, number: 4, connected: true, editName: type === "TV" ? undefined : inputName };
  const env = createCardEnvironment();
  renderWithEnglish(<InputCard env={env} source={source} glass compact={false} />);

  const button = screen.getByRole("button", { name: inputName });
  expect(button.querySelector(`svg.lucide-${glyph}[aria-hidden="true"]`)).not.toBeNull();
});
