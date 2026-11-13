import { act, render } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import type { InputScopeOptions } from "../../contracts/remoteInput";
import { launcherConfig } from "../../launcherConfig";

import { InputScopeContext } from "./context";
import { createInputDispatcher } from "./createInputDispatcher";
import { createInputScope } from "./createInputScope";
import { useInputScope } from "./useInputScope";

const Probe = ({ active = true, handle, onCancel }: InputScopeOptions & { active?: boolean }) => {
  useInputScope({ isActive: () => active, handle, onCancel, modal: true });
  return null;
};

test("a view registers one scope, uses current callbacks and removes it on unmount", async () => {
  const root = createInputScope();
  const first = vi.fn(() => "handled" as const);
  const second = vi.fn(() => "handled" as const);
  const cancel = vi.fn();
  const { rerender, unmount } = render(
    <InputScopeContext.Provider value={root}>
      <Probe handle={first} onCancel={cancel} />
    </InputScopeContext.Provider>,
  );
  const revision = root.getSnapshot();
  const input = createInputDispatcher(launcherConfig.KEY, [root]);
  const event = { preventDefault: vi.fn() };
  await act(() => input.keydown(launcherConfig.KEY.LEFT, event));
  await act(() => input.keyup(launcherConfig.KEY.LEFT, event));
  rerender(
    <InputScopeContext.Provider value={root}>
      <Probe handle={second} onCancel={cancel} />
    </InputScopeContext.Provider>,
  );
  expect(root.getSnapshot()).toBe(revision);
  await act(() => input.keydown(launcherConfig.KEY.RIGHT, event));
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledOnce();
  unmount();
  input.keyup(launcherConfig.KEY.RIGHT, event);
  expect(root.getPath()).toHaveLength(1);
  expect(second).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalled();
});

test("deactivation and reactivation before release cancel the original press", async () => {
  const root = createInputScope();
  const handle = vi.fn(() => "handled" as const);
  const { rerender } = render(
    <InputScopeContext.Provider value={root}>
      <Probe handle={handle} />
    </InputScopeContext.Provider>,
  );
  const input = createInputDispatcher(launcherConfig.KEY, [root]);
  const event = { preventDefault: vi.fn() };
  input.keydown(launcherConfig.KEY.ENTER, event);
  rerender(
    <InputScopeContext.Provider value={root}>
      <Probe active={false} handle={handle} />
    </InputScopeContext.Provider>,
  );
  rerender(
    <InputScopeContext.Provider value={root}>
      <Probe handle={handle} />
    </InputScopeContext.Provider>,
  );
  await act(() => input.keyup(launcherConfig.KEY.ENTER, event));
  expect(handle).toHaveBeenCalledOnce();
});
