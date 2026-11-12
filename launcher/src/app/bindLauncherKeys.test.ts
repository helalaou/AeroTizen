import type { TestContext } from "vitest";
import { expect, test, vi } from "vitest";

import { launcherConfig } from "../launcherConfig";

import { bindLauncherKeys } from "./bindLauncherKeys";

const { KEY } = launcherConfig;
const createHarness = (onTestFinished: TestContext["onTestFinished"]) => {
  const home = { keydown: vi.fn(), keyup: vi.fn() };
  const fireplace = { isActive: vi.fn(() => false), keydown: vi.fn() };
  const settings = { isOpen: vi.fn(() => false), keydown: vi.fn(), focus: vi.fn() };
  const inputs = { isActive: vi.fn(() => false), keydown: vi.fn() };
  const targets = { home, fireplace, settings, inputs };
  const dispose = bindLauncherKeys(document, KEY, targets);
  onTestFinished(dispose);
  const dispatch = (type: "keydown" | "keyup", code: number) => {
    const event = new KeyboardEvent(type, { keyCode: code, cancelable: true });
    document.dispatchEvent(event);
    return event;
  };
  return { ...targets, targets, dispose, dispatch };
};

test("Home receives keydown and keyup when no overlay is active", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const event = h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.home.keydown).toHaveBeenCalledExactlyOnceWith(KEY.LEFT, event);
  expect(h.home.keyup).toHaveBeenCalledExactlyOnceWith(KEY.ENTER);
  expect(h.fireplace.keydown).not.toHaveBeenCalled();
  expect(h.inputs.keydown).not.toHaveBeenCalled();
  expect(h.settings.keydown).not.toHaveBeenCalled();
});

test("an active Fireplace receives keys before input playback and Settings", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.fireplace.isActive.mockReturnValue(true);
  h.inputs.isActive.mockReturnValue(true);
  h.settings.isOpen.mockReturnValue(true);
  const event = h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.fireplace.keydown).toHaveBeenCalledExactlyOnceWith(KEY.LEFT, event);
  expect(event.defaultPrevented).toBe(false);
  expect(h.inputs.keydown).not.toHaveBeenCalled();
  expect(h.settings.keydown).not.toHaveBeenCalled();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test.for([KEY.ENTER, KEY.BACK, KEY.ESC, KEY.IME_DONE, KEY.IME_CANCEL])(
  "text entry handles exit key %i before active overlays",
  (code, { onTestFinished }) => {
    const h = createHarness(onTestFinished);
    h.fireplace.isActive.mockReturnValue(true);
    h.inputs.isActive.mockReturnValue(true);
    const input = document.createElement("input");
    document.body.append(input);
    onTestFinished(() => input.remove());
    input.focus();
    const event = h.dispatch("keydown", code);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(input);
    expect(h.settings.focus).toHaveBeenCalledOnce();
    expect(h.fireplace.keydown).not.toHaveBeenCalled();
    expect(h.inputs.keydown).not.toHaveBeenCalled();
    expect(h.home.keydown).not.toHaveBeenCalled();
  },
);

test("text entry keeps ordinary keys and retains the existing Home keyup route", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const input = document.createElement("input");
  document.body.append(input);
  onTestFinished(() => input.remove());
  input.focus();
  const event = h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);

  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(h.settings.focus).not.toHaveBeenCalled();
  expect(h.fireplace.keydown).not.toHaveBeenCalled();
  expect(h.inputs.keydown).not.toHaveBeenCalled();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).toHaveBeenCalledExactlyOnceWith(KEY.ENTER);
});

test("active input playback receives all keys before Settings and blocks Home keyup", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.inputs.isActive.mockReturnValue(true);
  h.settings.isOpen.mockReturnValue(true);
  const event = h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.inputs.keydown).toHaveBeenCalledExactlyOnceWith(KEY.LEFT, event);
  expect(event.defaultPrevented).toBe(false);
  expect(h.fireplace.keydown).not.toHaveBeenCalled();
  expect(h.settings.keydown).not.toHaveBeenCalled();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test("Settings receives keys before Home and blocks Home keyup", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.settings.isOpen.mockReturnValue(true);
  const event = h.dispatch("keydown", KEY.ENTER);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.settings.keydown).toHaveBeenCalledExactlyOnceWith(KEY.ENTER, event);
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test("Home receives keyup after Fireplace closes during keydown", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.fireplace.isActive.mockReturnValue(true);
  h.fireplace.keydown.mockImplementation(() => h.fireplace.isActive.mockReturnValue(false));
  h.dispatch("keydown", KEY.ENTER);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.fireplace.keydown).toHaveBeenCalledOnce();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).toHaveBeenCalledExactlyOnceWith(KEY.ENTER);
});

test("Home receives keyup after input playback exits during keydown", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.inputs.isActive.mockReturnValue(true);
  h.inputs.keydown.mockImplementation(() => h.inputs.isActive.mockReturnValue(false));
  h.dispatch("keydown", KEY.ENTER);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.inputs.keydown).toHaveBeenCalledOnce();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).toHaveBeenCalledExactlyOnceWith(KEY.ENTER);
});

test("disposal removes both listeners and rebinding delivers each event once", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.dispose();
  h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();

  const dispose = bindLauncherKeys(document, KEY, h.targets);
  onTestFinished(dispose);
  h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);
  expect(h.home.keydown).toHaveBeenCalledOnce();
  expect(h.home.keyup).toHaveBeenCalledOnce();

  dispose();
  h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.ENTER);
  expect(h.home.keydown).toHaveBeenCalledOnce();
  expect(h.home.keyup).toHaveBeenCalledOnce();
});
