import { screen } from "@testing-library/preact";
import { expect, test } from "vitest";

import { renderWithEnglish } from "../../../test/renderWithEnglish";

import { SettingsHelp } from "./SettingsHelp";

test("renders three decorative arrows with the remote help text", () => {
  const { container } = renderWithEnglish(<SettingsHelp />);
  expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
  expect(screen.queryByRole("img")).toBeNull();
});
