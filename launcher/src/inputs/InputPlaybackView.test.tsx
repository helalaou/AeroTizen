import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";

import type { InputsSnapshot } from "../contracts/inputs";
import { createStore } from "../shared/state/createStore";

import { InputPlaybackView } from "./InputPlaybackView";

afterEach(cleanup);

test("native playback state controls the shell and background without reacting to discovery-only updates", async () => {
  const initial: InputsSnapshot = { sources: [], visibleSources: [], playback: "idle" };
  const store = createStore(initial);
  const applyBackground = vi.fn();
  const suspendBackground = vi.fn();
  const background = document.documentElement.style.background;
  const { unmount } = render(
    <InputPlaybackView
      inputs={store}
      document={document}
      applyBackground={applyBackground}
      suspendBackground={suspendBackground}
    />,
  );
  await act(() => store.set({ ...initial, playback: "opening" }));
  expect(document.body.classList.contains("tv")).toBe(false);
  await act(() => store.set({ ...initial, playback: "playing" }));
  expect(document.body.classList.contains("tv")).toBe(true);
  expect(suspendBackground).toHaveBeenCalledTimes(1);
  await act(() => store.set({ ...store.getSnapshot(), sources: [{ type: "HDMI", number: 1 }] }));
  expect(suspendBackground).toHaveBeenCalledTimes(1);
  await act(() => store.set(initial));
  expect(document.body.classList.contains("tv")).toBe(false);
  expect(document.documentElement.style.background).toBe(background);
  expect(applyBackground).toHaveBeenCalledTimes(1);
  await act(() => store.set({ ...initial, playback: "playing" }));
  unmount();
  expect(document.body.classList.contains("tv")).toBe(false);
  expect(document.documentElement.style.background).toBe(background);
});
