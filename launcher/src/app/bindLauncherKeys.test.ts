import type { TestContext } from "vitest";
import { expect, test, vi } from "vitest";

import { launcherConfig } from "../launcherConfig";
import { createInputScope } from "../shared/input/createInputScope";

import { bindLauncherKeys } from "./bindLauncherKeys";
import { createLauncherInputScopes } from "./createLauncherInputScopes";

const { KEY } = launcherConfig;
const createHarness = (onTestFinished: TestContext["onTestFinished"]) => {
  const homeHandlers = { keydown: vi.fn(), keyup: vi.fn(), cancelInput: vi.fn() };
  const home = {
    ...homeHandlers,
    inputScope: createInputScope({
      onCancel: homeHandlers.cancelInput,
      handle({ code, nativeEvent, phase }) {
        if (phase === "down") {
          homeHandlers.keydown(code, nativeEvent);
        } else {
          homeHandlers.keyup(code);
        }
        return "native";
      },
    }),
  };
  const fireplace = { isActive: vi.fn(() => false), keydown: vi.fn() };
  const settings = { isOpen: vi.fn(() => false), keydown: vi.fn() };
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
  const dispose = bindLauncherKeys(document, KEY, createLauncherInputScopes(targets));
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

test("unregistered text fields do not override the active feature's scope", ({ onTestFinished }) => {
  const h = createHarness(onTestFinished);
  h.fireplace.isActive.mockReturnValue(true);
  const input = document.createElement("input");
  document.body.append(input);
  onTestFinished(() => input.remove());
  input.focus();
  const event = h.dispatch("keydown", KEY.BACK);
  expect(h.fireplace.keydown).toHaveBeenCalledExactlyOnceWith(KEY.BACK, event);
  expect(h.settings.keydown).not.toHaveBeenCalled();
  expect(h.home.keydown).not.toHaveBeenCalled();
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

  const dispose = bindLauncherKeys(document, KEY, createLauncherInputScopes(h.targets));
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
  h.home.cancelInput.mockClear();
  window.dispatchEvent(new Event("blur"));
  expect(h.home.cancelInput).not.toHaveBeenCalled();
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
