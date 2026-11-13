import type { TestContext } from "vitest";
import { expect, test, vi } from "vitest";

import { launcherConfig } from "../launcherConfig";
import { createInputScope } from "../shared/input/createInputScope";

import { bindLauncherKeys } from "./bindLauncherKeys";
import { createLauncherInputScopes } from "./createLauncherInputScopes";

const { KEY } = launcherConfig;
const SPACE_KEY_CODE = 32;
const createHarness = (onTestFinished: TestContext["onTestFinished"]) => {
  const home = { keydown: vi.fn(), keyup: vi.fn(), cancelInput: vi.fn() };
  const fireplace = { isActive: vi.fn(() => false), keydown: vi.fn() };
  const settings = { isOpen: vi.fn(() => false), keydown: vi.fn(), focus: vi.fn() };
  const inputs = { isActive: vi.fn(() => false), keydown: vi.fn() };
  const inputScope = createInputScope({
    isActive: settings.isOpen,
    handle(event) {
      if (event.phase === "down") {
        settings.keydown(event.code, event.nativeEvent);
      }
      return "native";
    },
  });
  const targets = { home, fireplace, settings: { ...settings, inputScope }, inputs };
  const dispose = bindLauncherKeys(document, KEY, createLauncherInputScopes(document, KEY, targets));
  onTestFinished(dispose);
  const dispatch = (type: "keydown" | "keyup", code: number) => {
    const event = new KeyboardEvent(type, { keyCode: code, cancelable: true });
    document.dispatchEvent(event);
    return event;
  };
  return { ...targets, targets, dispose, dispatch };
};

test("Home receives a complete press when no overlay is active", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const event = h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.LEFT);

  expect(h.home.keydown).toHaveBeenCalledExactlyOnceWith(KEY.LEFT, event);
  expect(h.home.keyup).toHaveBeenCalledExactlyOnceWith(KEY.LEFT);
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

test("text entry retains ordinary keys and their releases", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const input = document.createElement("input");
  document.body.append(input);
  onTestFinished(() => input.remove());
  input.focus();
  const event = h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.LEFT);

  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(h.settings.focus).not.toHaveBeenCalled();
  expect(h.fireplace.keydown).not.toHaveBeenCalled();
  expect(h.inputs.keydown).not.toHaveBeenCalled();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test("text focus cancels a pending Home press before the next key event", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const input = document.createElement("input");
  document.body.append(input);
  onTestFinished(() => input.remove());
  h.dispatch("keydown", KEY.ENTER);
  input.focus();
  expect(h.home.cancelInput).toHaveBeenCalledOnce();
  input.blur();
  h.dispatch("keyup", KEY.ENTER);
  expect(h.home.keyup).not.toHaveBeenCalled();
  h.dispatch("keydown", KEY.ENTER);
  h.dispose();
  const cancellations = h.home.cancelInput.mock.calls.length;
  input.focus();
  expect(h.home.cancelInput).toHaveBeenCalledTimes(cancellations);
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

test("closing Fireplace cannot send its release to Home", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.fireplace.isActive.mockReturnValue(true);
  h.fireplace.keydown.mockImplementation(() => h.fireplace.isActive.mockReturnValue(false));
  h.dispatch("keydown", KEY.ENTER);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.fireplace.keydown).toHaveBeenCalledOnce();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test("exiting input playback cannot send its release to Home", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.inputs.isActive.mockReturnValue(true);
  h.inputs.keydown.mockImplementation(() => h.inputs.isActive.mockReturnValue(false));
  h.dispatch("keydown", KEY.ENTER);
  h.dispatch("keyup", KEY.ENTER);

  expect(h.inputs.keydown).toHaveBeenCalledOnce();
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test("disposal removes both listeners and rebinding delivers each event once", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.dispose();
  h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.LEFT);
  expect(h.home.keydown).not.toHaveBeenCalled();
  expect(h.home.keyup).not.toHaveBeenCalled();

  const dispose = bindLauncherKeys(document, KEY, createLauncherInputScopes(document, KEY, h.targets));
  onTestFinished(dispose);
  h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.LEFT);
  expect(h.home.keydown).toHaveBeenCalledOnce();
  expect(h.home.keyup).toHaveBeenCalledOnce();

  dispose();
  h.dispatch("keydown", KEY.LEFT);
  h.dispatch("keyup", KEY.LEFT);
  expect(h.home.keydown).toHaveBeenCalledOnce();
  expect(h.home.keyup).toHaveBeenCalledOnce();
});

test("window blur cancels a pending press and disposal removes the blur listener", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.dispatch("keydown", KEY.ENTER);
  window.dispatchEvent(new Event("blur"));
  h.dispatch("keyup", KEY.ENTER);
  expect(h.home.cancelInput).toHaveBeenCalledOnce();
  expect(h.home.keyup).not.toHaveBeenCalled();
  h.dispose();
  window.dispatchEvent(new Event("blur"));
  expect(h.home.cancelInput).toHaveBeenCalledOnce();
});

test("hidden visibility cancels input without a later Home activation", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  onTestFinished(() => hidden.mockRestore());
  h.dispatch("keydown", KEY.ENTER);
  document.dispatchEvent(new Event("visibilitychange"));
  h.dispatch("keyup", KEY.ENTER);
  expect(h.home.cancelInput).toHaveBeenCalledOnce();
  expect(h.home.keyup).not.toHaveBeenCalled();
});

test("native text entry keeps repeated Space presses and browser defaults", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const input = document.createElement("input");
  document.body.append(input);
  onTestFinished(() => input.remove());
  input.focus();
  const first = h.dispatch("keydown", SPACE_KEY_CODE);
  const repeated = new KeyboardEvent("keydown", { keyCode: SPACE_KEY_CODE, repeat: true, cancelable: true });
  document.dispatchEvent(repeated);
  h.dispatch("keyup", SPACE_KEY_CODE);
  expect(first.defaultPrevented).toBe(false);
  expect(repeated.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(h.settings.keydown).not.toHaveBeenCalled();
  expect(h.home.keydown).not.toHaveBeenCalled();
});

test("native text composition owns Enter until IME Done completes it", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  const input = document.createElement("input");
  document.body.append(input);
  onTestFinished(() => input.remove());
  input.focus();
  const composing = new KeyboardEvent("keydown", { keyCode: KEY.ENTER, isComposing: true, cancelable: true });
  document.dispatchEvent(composing);
  const repeated = new KeyboardEvent("keydown", {
    keyCode: KEY.ENTER,
    isComposing: true,
    repeat: true,
    cancelable: true,
  });
  document.dispatchEvent(repeated);
  h.dispatch("keyup", KEY.ENTER);
  expect(composing.defaultPrevented).toBe(false);
  expect(repeated.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(h.settings.focus).not.toHaveBeenCalled();
  h.dispatch("keydown", KEY.IME_DONE);
  expect(document.activeElement).not.toBe(input);
  expect(h.settings.focus).toHaveBeenCalledOnce();
});
