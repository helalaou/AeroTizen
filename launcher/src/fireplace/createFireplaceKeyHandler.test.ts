import { expect, test, vi } from "vitest";

import { launcherConfig } from "../launcherConfig";

import { createFireplaceKeyHandler } from "./createFireplaceKeyHandler";

const { KEY } = launcherConfig;
const createControls = () => ({
  isOpen: vi.fn(() => true),
  close: vi.fn(),
  volumeUp: vi.fn(),
  volumeDown: vi.fn(),
});

test("the active state follows the current Fireplace state", () => {
  const controls = createControls();
  const handler = createFireplaceKeyHandler(KEY, controls);
  expect(handler.isActive()).toBe(true);
  controls.isOpen.mockReturnValue(false);
  expect(handler.isActive()).toBe(false);
});

test.each([
  { code: KEY.UP, action: "volumeUp" as const },
  { code: KEY.DOWN, action: "volumeDown" as const },
])("$action handles repeated volume keys without preventing native defaults", ({ code, action }) => {
  const controls = createControls();
  const event = { preventDefault: vi.fn() };
  const handler = createFireplaceKeyHandler(KEY, controls);

  handler.keydown(code, event);
  handler.keydown(code, event);

  expect(controls[action]).toHaveBeenCalledTimes(2);
  expect(controls[action === "volumeUp" ? "volumeDown" : "volumeUp"]).not.toHaveBeenCalled();
  expect(controls.close).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test.each([KEY.ENTER, KEY.BACK, KEY.ESC])("close key %i prevents its default and closes Fireplace", (code) => {
  const controls = createControls();
  const event = { preventDefault: vi.fn() };
  createFireplaceKeyHandler(KEY, controls).keydown(code, event);

  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(controls.close).toHaveBeenCalledOnce();
  expect(controls.volumeUp).not.toHaveBeenCalled();
  expect(controls.volumeDown).not.toHaveBeenCalled();
});

test.each([KEY.LEFT, KEY.RIGHT, KEY.IME_DONE, KEY.IME_CANCEL])("unassigned key %i has no Fireplace action", (code) => {
  const controls = createControls();
  const event = { preventDefault: vi.fn() };
  createFireplaceKeyHandler(KEY, controls).keydown(code, event);

  expect(controls.close).not.toHaveBeenCalled();
  expect(controls.volumeUp).not.toHaveBeenCalled();
  expect(controls.volumeDown).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});
