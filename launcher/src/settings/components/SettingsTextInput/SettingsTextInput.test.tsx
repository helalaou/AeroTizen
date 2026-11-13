import { act, fireEvent, screen } from "@testing-library/preact";
import type { ComponentProps } from "preact";
import { afterEach, expect, test, vi } from "vitest";

import { bindLauncherKeys } from "../../../app/bindLauncherKeys";
import { launcherConfig } from "../../../launcherConfig";
import english from "../../../shared/i18n/en.json";
import { InputScopeContext } from "../../../shared/input/context";
import { createInputScope } from "../../../shared/input/createInputScope";
import type { Navigation } from "../../../shared/navigation/createNavigation";
import { createNavigation } from "../../../shared/navigation/createNavigation";
import { focusControl } from "../../../shared/navigation/focusControl";
import { renderWithEnglish } from "../../../test/renderWithEnglish";

import { SettingsTextInput } from "./SettingsTextInput";

let navigation: Navigation;
vi.mock("../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation, services: { config: launcherConfig } }),
}));

const { KEY } = launcherConfig;
const SPACE_KEY_CODE = 32;
const BACKSPACE_KEY_CODE = 8;
const disposers: (() => void)[] = [];
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

const harness = (options: Partial<ComponentProps<typeof SettingsTextInput>> = {}) => {
  navigation = createNavigation(focusControl);
  const parent = vi.fn(() => "native" as const);
  const cancelParent = vi.fn();
  const onCommit = vi.fn();
  const onSubmit = vi.fn();
  const onValueChange = vi.fn();
  const root = createInputScope({ modal: true, handle: parent, onCancel: cancelParent });
  const ui = (props: Partial<ComponentProps<typeof SettingsTextInput>>) => (
    <InputScopeContext.Provider value={root}>
      <SettingsTextInput
        focusKey="query"
        label={english["weather.locationLabel"]}
        maxLength={24}
        value="Saved"
        onCommit={onCommit}
        onSubmit={onSubmit}
        onValueChange={onValueChange}
        {...props}
      />
    </InputScopeContext.Provider>
  );
  const result = renderWithEnglish(ui(options));
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Weather location" });
  const control = input.parentElement as HTMLElement;
  Object.defineProperties(control, {
    offsetParent: { get: () => document.body },
    offsetHeight: { get: () => 72 },
  });
  const dispose = bindLauncherKeys(document, KEY, [root]);
  disposers.push(dispose);
  const dispatch = (type: "keydown" | "keyup", code: number, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent(type, { keyCode: code, bubbles: true, cancelable: true, ...extra });
    void act(() => {
      (document.activeElement ?? document).dispatchEvent(event);
    });
    return event;
  };
  const focus = () => {
    void act(() => input.focus());
    parent.mockClear();
  };
  return {
    ...result,
    input,
    control,
    parent,
    cancelParent,
    onCommit,
    onSubmit,
    onValueChange,
    dispatch,
    focus,
    rerenderInput: (props: Partial<ComponentProps<typeof SettingsTextInput>>) =>
      result.rerender(ui({ ...options, ...props })),
  };
};

test.each([KEY.LEFT, KEY.RIGHT, KEY.UP, KEY.DOWN, SPACE_KEY_CODE, BACKSPACE_KEY_CODE])(
  "native editing retains key %s, repeats and browser defaults",
  (code) => {
    const h = harness();
    h.focus();
    expect(h.dispatch("keydown", code).defaultPrevented).toBe(false);
    expect(h.dispatch("keydown", code, { repeat: true }).defaultPrevented).toBe(false);
    expect(h.dispatch("keyup", code).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(h.input);
    expect(h.parent).not.toHaveBeenCalled();
    expect(h.onSubmit).not.toHaveBeenCalled();
  },
);

test.each([KEY.ENTER, KEY.BACK, KEY.ESC, KEY.IME_DONE, KEY.IME_CANCEL])(
  "exit key %s commits once, restores control focus and cannot repeat into its parent",
  (code) => {
    const h = harness();
    h.focus();
    fireEvent.input(h.input, { target: { value: "  New name  " } });
    const event = h.dispatch("keydown", code);
    expect(event.defaultPrevented).toBe(true);
    expect(h.onCommit).toHaveBeenCalledExactlyOnceWith("New name");
    expect(h.onSubmit).toHaveBeenCalledTimes(code === KEY.ENTER || code === KEY.IME_DONE ? 1 : 0);
    expect(document.activeElement).toBe(h.control);
    h.dispatch("keydown", code, { repeat: true });
    h.dispatch("keyup", code);
    expect(h.parent).not.toHaveBeenCalled();
    expect(h.onCommit).toHaveBeenCalledOnce();
  },
);

test("composition retains Enter, repeats and cancellation until IME Done", () => {
  const h = harness();
  h.focus();
  for (const code of [KEY.ENTER, KEY.BACK, KEY.IME_CANCEL]) {
    expect(h.dispatch("keydown", code, { isComposing: true }).defaultPrevented).toBe(false);
    expect(h.dispatch("keydown", code, { isComposing: true, repeat: true }).defaultPrevented).toBe(false);
    h.dispatch("keyup", code);
  }
  expect(document.activeElement).toBe(h.input);
  expect(h.onCommit).not.toHaveBeenCalled();
  expect(h.onSubmit).not.toHaveBeenCalled();
  h.dispatch("keydown", KEY.IME_DONE, { isComposing: true });
  expect(h.onSubmit).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(h.control);
});

test("the draft survives external values and blur commits its latest text", () => {
  const h = harness();
  h.focus();
  fireEvent.input(h.input, { target: { value: "Draft" } });
  h.rerenderInput({ value: "External" });
  expect(h.input.value).toBe("Draft");
  expect(h.onValueChange).toHaveBeenCalledExactlyOnceWith("Draft");
  void act(() => h.input.blur());
  expect(h.onCommit).toHaveBeenCalledExactlyOnceWith("Draft");
  expect(h.input.value).toBe("External");
});

test("focus acquisition cancels a held parent press without submitting the field", () => {
  const h = harness();
  h.dispatch("keydown", KEY.ENTER);
  h.cancelParent.mockClear();
  h.focus();
  expect(h.cancelParent).toHaveBeenCalledOnce();
  h.dispatch("keydown", KEY.ENTER, { repeat: true });
  h.dispatch("keyup", KEY.ENTER);
  expect(h.onSubmit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(h.input);
});

test("deactivation and window blur finish native editing without a late parent release", () => {
  const h = harness();
  h.focus();
  h.dispatch("keydown", KEY.RIGHT);
  h.rerenderInput({ active: false });
  expect(document.activeElement).not.toBe(h.input);
  h.dispatch("keyup", KEY.RIGHT);
  expect(h.parent).not.toHaveBeenCalled();
  h.rerenderInput({ active: true });
  h.focus();
  void act(() => {
    window.dispatchEvent(new Event("blur"));
  });
  expect(document.activeElement).not.toBe(h.input);
  expect(h.onCommit).toHaveBeenCalledTimes(2);
});

test("a held exit key cannot act again after the field is refocused", () => {
  const h = harness();
  h.focus();
  h.dispatch("keydown", KEY.BACK);
  h.focus();
  h.dispatch("keydown", KEY.BACK, { repeat: true });
  h.dispatch("keyup", KEY.BACK);
  expect(document.activeElement).toBe(h.input);
  expect(h.onCommit).toHaveBeenCalledOnce();
  h.dispatch("keydown", KEY.BACK);
  expect(h.onCommit).toHaveBeenCalledTimes(2);
});

test("unmounting a native field cancels its held key before the parent can receive it", () => {
  const h = harness();
  h.focus();
  h.dispatch("keydown", KEY.LEFT);
  h.unmount();
  h.dispatch("keydown", KEY.LEFT, { repeat: true });
  h.dispatch("keyup", KEY.LEFT);
  expect(h.parent).not.toHaveBeenCalled();
  expect(h.onSubmit).not.toHaveBeenCalled();
});

test("native Enter also submits when the browser supplies a key name without a TV code", () => {
  const h = harness();
  h.focus();
  expect(h.dispatch("keydown", 0, { key: "Enter" }).defaultPrevented).toBe(true);
  h.dispatch("keyup", 0, { key: "Enter" });
  expect(h.onSubmit).toHaveBeenCalledOnce();
  expect(h.onCommit).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(h.control);
  expect(h.parent).not.toHaveBeenCalled();
});
