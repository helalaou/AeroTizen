import { expect, test, vi } from "vitest";

import type { InputsSnapshot } from "../contracts/inputs";
import { launcherConfig } from "../launcherConfig";
import { createStore } from "../shared/state/createStore";

import { createInputPlaybackKeyHandler } from "./createInputPlaybackKeyHandler";

const { KEY } = launcherConfig;
const ACTIVE_PLAYBACK_STATES = ["opening", "playing"] as const;
const EXIT_KEYS = [
  { name: "Enter", code: KEY.ENTER },
  { name: "Back", code: KEY.BACK },
  { name: "Escape", code: KEY.ESC },
] as const;
const createHarness = () => {
  const state = createStore<InputsSnapshot>({ playback: "idle", sources: [], visibleSources: [] });
  const inputs = {
    getSnapshot: state.getSnapshot,
    leave: vi.fn(() => state.set({ ...state.getSnapshot(), playback: "idle" })),
  };
  return { state, inputs, handler: createInputPlaybackKeyHandler(KEY, inputs) };
};

test("active state follows opening, playback and return to idle without a subscription", () => {
  const { state, handler } = createHarness();
  expect(handler.isActive()).toBe(false);
  for (const playback of ACTIVE_PLAYBACK_STATES) {
    state.set({ ...state.getSnapshot(), playback });
    expect(handler.isActive()).toBe(true);
  }
  state.set({ ...state.getSnapshot(), playback: "idle" });
  expect(handler.isActive()).toBe(false);
});

for (const playback of ACTIVE_PLAYBACK_STATES) {
  test.each(EXIT_KEYS)(`$name exits input playback during ${playback} and prevents the native default`, ({ code }) => {
    const { state, inputs, handler } = createHarness();
    state.set({ ...state.getSnapshot(), playback });
    const event = { preventDefault: vi.fn() };
    handler.keydown(code, event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(inputs.leave).toHaveBeenCalledOnce();
    expect(handler.isActive()).toBe(false);
  });
}

test.each([KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT, KEY.IME_DONE, KEY.IME_CANCEL])(
  "unassigned key %i keeps input playback active without preventing native defaults",
  (code) => {
    const { state, inputs, handler } = createHarness();
    for (const playback of ACTIVE_PLAYBACK_STATES) {
      state.set({ ...state.getSnapshot(), playback });
      const event = { preventDefault: vi.fn() };
      handler.keydown(code, event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(inputs.leave).not.toHaveBeenCalled();
      expect(state.getSnapshot().playback).toBe(playback);
      expect(handler.isActive()).toBe(true);
    }
  },
);
