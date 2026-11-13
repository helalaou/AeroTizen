import { act, fireEvent, screen } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";

import { launcherConfig } from "../../../launcherConfig";
import { InputScopeContext } from "../../../shared/input/context";
import { createInputDispatcher } from "../../../shared/input/createInputDispatcher";
import { createInputScope } from "../../../shared/input/createInputScope";
import { createStore } from "../../../shared/state/createStore";
import { renderWithEnglish } from "../../../test/renderWithEnglish";
import type { HomeEnvironment, HomeMenuChoice, HomeState } from "../../types";

import { AppActionsMenu } from "./AppActionsMenu";

const { KEY } = launcherConfig;
const TAB_KEY_CODE = 9;
const SPACE_KEY_CODE = 32;
const MENU_CHOICES: readonly HomeMenuChoice[] = [
  { action: "move", label: "home.move" },
  { action: "remove", label: "home.removeFromHome" },
];
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.documentElement.dir = "ltr";
});

const harness = () => {
  const state = createStore<HomeState>({
    active: true,
    page: "home",
    selected: "app:demo",
    menu: null,
    moving: null,
    draft: null,
    appOffset: 0,
    appsEndOffset: 0,
    continueOffset: 0,
    scroll: 0,
  });
  const origin = document.createElement("button");
  document.body.append(origin);
  disposers.push(() => origin.remove());
  const close = () => {
    state.set({ ...state.getSnapshot(), menu: null });
    origin.focus();
  };
  const choose = vi.fn(close);
  const dismiss = vi.fn(close);
  const env: Pick<HomeEnvironment, "state" | "nodes" | "choose" | "dismiss" | "menuChoices"> = {
    state,
    nodes: new Map([["app:demo", origin]]),
    choose,
    dismiss,
    menuChoices: () => MENU_CHOICES,
  };
  const parent = vi.fn(() => "native" as const);
  const cancelParent = vi.fn();
  const root = createInputScope({ handle: parent, onCancel: cancelParent });
  const result = renderWithEnglish(
    <InputScopeContext.Provider value={root}>
      <AppActionsMenu env={env as HomeEnvironment} />
    </InputScopeContext.Provider>,
  );
  const input = createInputDispatcher(KEY, [root]);
  disposers.push(input.dispose);
  cancelParent.mockClear();
  const down = async (code: number) => {
    const event = { preventDefault: vi.fn() };
    await act(() => input.keydown(code, event));
    return event;
  };
  const up = (code: number) => act(() => input.keyup(code, { preventDefault: vi.fn() }));
  const press = async (code: number) => {
    await down(code);
    await up(code);
  };
  const open = () => act(() => state.set({ ...state.getSnapshot(), menu: { id: "demo" } }));
  return { ...result, state, input, root, parent, cancelParent, choose, dismiss, origin, down, up, press, open };
};

test("opening the menu cancels Home's held press and takes native focus", async () => {
  const h = harness();
  await h.down(KEY.ENTER);
  await h.open();
  expect(h.cancelParent).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(screen.getByRole("menu"));
  expect(screen.getByRole("menu").getAttribute("aria-activedescendant")).toBe(
    screen.getByRole("menuitem", { name: "Move" }).id,
  );
  h.parent.mockClear();
  await h.down(KEY.ENTER);
  await h.up(KEY.ENTER);
  expect(h.choose).not.toHaveBeenCalled();
  expect(h.parent).not.toHaveBeenCalled();
});

test("menu navigation owns selection, clamps its edges and leaves Home state unchanged", async () => {
  const h = harness();
  await h.open();
  const snapshot = h.state.getSnapshot();
  await h.press(KEY.DOWN);
  await h.press(KEY.DOWN);
  expect(screen.getByRole("menuitem", { name: "Remove from Home" }).getAttribute("aria-selected")).toBe("true");
  expect(h.state.getSnapshot()).toBe(snapshot);
  await h.press(KEY.LEFT);
  expect(screen.getByRole("menuitem", { name: "Move" }).getAttribute("aria-selected")).toBe("true");
  expect(h.parent).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole("menu"));
});

test("horizontal menu keys preserve right-to-left direction", async () => {
  document.documentElement.dir = "rtl";
  const h = harness();
  await h.open();
  await h.press(KEY.LEFT);
  expect(screen.getByRole("menuitem", { name: "Remove from Home" }).getAttribute("aria-selected")).toBe("true");
  await h.press(KEY.RIGHT);
  expect(screen.getByRole("menuitem", { name: "Move" }).getAttribute("aria-selected")).toBe("true");
});

test.each([KEY.ENTER, SPACE_KEY_CODE])(
  "confirm key %s invokes the selected command once without transferring its release",
  async (code) => {
    const h = harness();
    await h.open();
    await h.press(KEY.DOWN);
    await h.down(code);
    await h.down(code);
    await h.up(code);
    expect(h.choose).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.parent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(h.origin);
    await h.press(KEY.RIGHT);
    expect(h.parent).toHaveBeenCalledTimes(2);
  },
);

test.each([KEY.BACK, KEY.ESC, TAB_KEY_CODE])(
  "exit key %s dismisses once and restores the originating app's focus",
  async (code) => {
    const h = harness();
    await h.open();
    await h.down(code);
    await h.down(code);
    await h.up(code);
    expect(h.dismiss).toHaveBeenCalledOnce();
    expect(h.choose).not.toHaveBeenCalled();
    expect(h.parent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(h.origin);
  },
);

test("pointer choices use the same commands and reopening resets menu selection", async () => {
  const h = harness();
  await h.open();
  await h.press(KEY.DOWN);
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove from Home" }));
  expect(h.choose).toHaveBeenCalledExactlyOnceWith(1);
  await h.open();
  expect(screen.getByRole("menuitem", { name: "Move" }).getAttribute("aria-selected")).toBe("true");
});

test("unrecognized menu keys keep native defaults while the modal blocks Home", async () => {
  const h = harness();
  await h.open();
  const volumeUpKeyCode = 447;
  const event = await h.down(volumeUpKeyCode);
  await h.up(volumeUpKeyCode);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(h.parent).not.toHaveBeenCalled();
  expect(h.choose).not.toHaveBeenCalled();
});

test("unmounting cancels the menu's held direction without delivering it to Home", async () => {
  const h = harness();
  await h.open();
  await h.down(KEY.DOWN);
  h.unmount();
  await h.down(KEY.DOWN);
  await h.up(KEY.DOWN);
  expect(h.parent).not.toHaveBeenCalled();
  expect(h.root.getPath()).toHaveLength(1);
});

test("reactivating Home returns focus to the open menu and retains selection", async () => {
  const h = harness();
  await h.open();
  await h.press(KEY.DOWN);
  await act(() => h.state.set({ ...h.state.getSnapshot(), active: false }));
  h.origin.focus();
  await act(() => h.state.set({ ...h.state.getSnapshot(), active: true }));
  expect(document.activeElement).toBe(screen.getByRole("menu"));
  expect(screen.getByRole("menuitem", { name: "Remove from Home" }).getAttribute("aria-selected")).toBe("true");
});
