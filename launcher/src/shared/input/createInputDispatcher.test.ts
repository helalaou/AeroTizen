import { expect, test, vi } from "vitest";

import type { ScopedInputEvent } from "../../contracts/remoteInput";
import { launcherConfig } from "../../launcherConfig";
import { createStore } from "../state/createStore";

import { createInputDispatcher } from "./createInputDispatcher";
import { createInputScope } from "./createInputScope";

const { KEY } = launcherConfig;
const nativeEvent = () => ({ preventDefault: vi.fn() });

test.each([
  { code: KEY.LEFT, action: "left" },
  { code: KEY.RIGHT, action: "right" },
  { code: KEY.UP, action: "up" },
  { code: KEY.DOWN, action: "down" },
  { code: KEY.ENTER, action: "confirm" },
  { code: KEY.BACK, action: "back" },
  { code: KEY.ESC, action: "back" },
  { code: KEY.IME_DONE, action: "done" },
  { code: KEY.IME_CANCEL, action: "cancel" },
])("normalizes key $code to $action and retains the complete press", ({ code, action }) => {
  const events: ScopedInputEvent[] = [];
  const scope = createInputScope({
    handle: (event) => {
      events.push(event);
      return "handled";
    },
  });
  const input = createInputDispatcher(KEY, [scope]);
  const down = nativeEvent();
  input.keydown(code, down);
  input.keyup(code, nativeEvent());
  expect(events.map(({ action, phase, repeat }) => ({ action, phase, repeat }))).toEqual([
    { action, phase: "down", repeat: false },
    { action, phase: "up", repeat: false },
  ]);
  expect(down.preventDefault).toHaveBeenCalledOnce();
});

test("controls bubble unhandled actions within their modal, without reaching its parent", () => {
  const outer = vi.fn(() => "handled" as const);
  const dialog = vi.fn((event: ScopedInputEvent) => (event.action === "up" ? "handled" : "unhandled"));
  const slider = vi.fn(() => "unhandled" as const);
  const root = createInputScope({ handle: outer });
  const modal = createInputScope({ modal: true, handle: dialog });
  modal.registerChild(createInputScope({ handle: slider }));
  root.registerChild(modal);
  const input = createInputDispatcher(KEY, [root]);
  const up = nativeEvent();
  input.keydown(KEY.UP, up);
  input.keyup(KEY.UP, nativeEvent());
  input.keydown(KEY.IME_DONE, nativeEvent());
  expect(slider).toHaveBeenCalledTimes(3);
  expect(dialog).toHaveBeenCalledTimes(3);
  expect(up.preventDefault).toHaveBeenCalledOnce();
  expect(outer).not.toHaveBeenCalled();
});

test("closing a child cancels its held press and blocks repeats and release in its parent", () => {
  const parent = vi.fn(() => "handled" as const);
  const cancelled = vi.fn();
  const child = vi.fn(() => "handled" as const);
  const root = createInputScope({ handle: parent });
  const remove = root.registerChild(createInputScope({ handle: child, onCancel: cancelled }));
  const input = createInputDispatcher(KEY, [root]);
  input.keydown(KEY.BACK, nativeEvent());
  remove();
  input.keydown(KEY.BACK, nativeEvent());
  input.keyup(KEY.BACK, nativeEvent());
  expect(child).toHaveBeenCalledOnce();
  expect(cancelled).toHaveBeenCalled();
  expect(parent).not.toHaveBeenCalled();
  input.keydown(KEY.BACK, nativeEvent());
  expect(parent).toHaveBeenCalledOnce();
});

test("opening and closing a child between press and release cannot activate the parent again", () => {
  const handle = vi.fn(() => "handled" as const);
  const root = createInputScope({ handle });
  const input = createInputDispatcher(KEY, [root]);
  input.keydown(KEY.ENTER, nativeEvent());
  const remove = root.registerChild(createInputScope());
  remove();
  input.keyup(KEY.ENTER, nativeEvent());
  expect(handle).toHaveBeenCalledOnce();
});

test("arrows repeat, while confirm and Back act only once until release", () => {
  const handle = vi.fn(() => "handled" as const);
  const input = createInputDispatcher(KEY, [createInputScope({ handle })]);
  for (const code of [KEY.RIGHT, KEY.ENTER, KEY.BACK]) {
    handle.mockClear();
    input.keydown(code, nativeEvent());
    input.keydown(code, nativeEvent());
    input.keyup(code, nativeEvent());
    expect(handle).toHaveBeenCalledTimes(code === KEY.RIGHT ? 3 : 2);
  }
});

test("a focus change cancels the old control and cannot transfer its key release", () => {
  let selected = "first";
  const first = vi.fn(() => "handled" as const);
  const second = vi.fn(() => "handled" as const);
  const cancel = vi.fn();
  const root = createInputScope();
  root.registerChild(createInputScope({ isActive: () => selected === "first", handle: first, onCancel: cancel }));
  root.registerChild(createInputScope({ isActive: () => selected === "second", handle: second }));
  const input = createInputDispatcher(KEY, [root]);
  input.keydown(KEY.RIGHT, nativeEvent());
  selected = "second";
  input.keyup(KEY.RIGHT, nativeEvent());
  expect(cancel).toHaveBeenCalledOnce();
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
});

test("a higher root preempts a modal, and an orphan release never reaches another screen", () => {
  let overlayOpen = false;
  const modal = vi.fn(() => "handled" as const);
  const overlay = vi.fn(() => "handled" as const);
  const settings = createInputScope();
  settings.registerChild(createInputScope({ modal: true, handle: modal }));
  const input = createInputDispatcher(KEY, [
    createInputScope({ isActive: () => overlayOpen, handle: overlay }),
    settings,
  ]);
  input.keydown(KEY.RIGHT, nativeEvent());
  overlayOpen = true;
  input.keyup(KEY.RIGHT, nativeEvent());
  input.keyup(KEY.ENTER, nativeEvent());
  expect(modal).toHaveBeenCalledOnce();
  expect(overlay).not.toHaveBeenCalled();
  input.keydown(KEY.ENTER, nativeEvent());
  expect(overlay).toHaveBeenCalledOnce();
});

test("cancellation releases held state without a late activation or native default changes", () => {
  const cancel = vi.fn();
  const handle = vi.fn(() => "native" as const);
  const input = createInputDispatcher(KEY, [createInputScope({ handle, onCancel: cancel })]);
  const event = nativeEvent();
  input.keydown(KEY.ENTER, event);
  input.cancel();
  input.keyup(KEY.ENTER, nativeEvent());
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
  expect(handle).toHaveBeenCalledOnce();
  input.keydown(KEY.ENTER, nativeEvent());
  expect(handle).toHaveBeenCalledTimes(2);
});

test("activation cancels a held press immediately, even if the overlay closes before release", () => {
  const active = createStore(false);
  const cancel = vi.fn(() => active.set(false));
  const home = vi.fn(() => "native" as const);
  const input = createInputDispatcher(KEY, [
    createInputScope({ isActive: active.getSnapshot, subscribe: active.subscribe }),
    createInputScope({ handle: home, onCancel: cancel }),
  ]);
  input.keydown(KEY.ENTER, nativeEvent());
  active.set(true);
  expect(cancel).toHaveBeenCalledOnce();
  active.set(false);
  input.keyup(KEY.ENTER, nativeEvent());
  expect(home).toHaveBeenCalledOnce();
  input.dispose();
});

test("disposal releases activation subscriptions as well as the pending press", () => {
  const unsubscribe = vi.fn();
  const handle = vi.fn(() => "native" as const);
  const input = createInputDispatcher(KEY, [createInputScope({ subscribe: () => unsubscribe, handle })]);
  input.keydown(KEY.LEFT, nativeEvent());
  input.dispose();
  input.dispose();
  input.keydown(KEY.RIGHT, nativeEvent());
  input.keyup(KEY.LEFT, nativeEvent());
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(handle).toHaveBeenCalledOnce();
});

test("nested activation cancels the parent immediately and removal releases the child subscription", () => {
  const active = createStore(false);
  const unsubscribe = vi.fn();
  const cancel = vi.fn();
  const root = createInputScope({ onCancel: cancel });
  const remove = root.registerChild(
    createInputScope({
      isActive: active.getSnapshot,
      subscribe(listener) {
        const stop = active.subscribe(listener);
        return () => {
          stop();
          unsubscribe();
        };
      },
    }),
  );
  cancel.mockClear();
  const input = createInputDispatcher(KEY, [root]);
  input.keydown(KEY.LEFT, nativeEvent());
  active.set(true);
  expect(cancel).toHaveBeenCalledOnce();
  remove();
  expect(unsubscribe).toHaveBeenCalledOnce();
  input.dispose();
});
