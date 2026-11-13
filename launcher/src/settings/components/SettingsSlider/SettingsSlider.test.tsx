import { act, fireEvent, screen } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";

import { launcherConfig } from "../../../launcherConfig";
import english from "../../../shared/i18n/en.json";
import { InputScopeContext } from "../../../shared/input/context";
import { createInputDispatcher } from "../../../shared/input/createInputDispatcher";
import { createInputScope } from "../../../shared/input/createInputScope";
import type { Navigation } from "../../../shared/navigation/createNavigation";
import { createNavigation } from "../../../shared/navigation/createNavigation";
import { renderWithEnglish } from "../../../test/renderWithEnglish";

import { SettingsSlider } from "./SettingsSlider";

let navigation: Navigation;
vi.mock("../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation }),
}));

const { KEY } = launcherConfig;
const disposers: (() => void)[] = [];
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

const harness = ({
  activation = "confirm",
  accelerate = false,
}: { activation?: "confirm" | "focus"; accelerate?: boolean } = {}) => {
  navigation = createNavigation(() => undefined);
  const onAdjust = vi.fn();
  const drawer = vi.fn();
  const root = createInputScope({
    handle(event) {
      if (event.phase === "down") {
        drawer(event.action);
        if (event.action === "confirm") {
          screen.getByRole("slider").click();
        }
      }
      return "native";
    },
  });
  const ui = (active: boolean) => (
    <InputScopeContext.Provider value={root}>
      <SettingsSlider
        active={active}
        activation={activation}
        accelerate={accelerate}
        focusKey="speed"
        label={english["wallpaper.speedLabel"]}
        unit="×"
        min={0.25}
        max={2}
        value={1}
        onAdjust={onAdjust}
      />
    </InputScopeContext.Provider>
  );
  const result = renderWithEnglish(ui(true));
  const slider = screen.getByRole("slider", { name: "Background speed", value: { now: 1 } });
  // jsdom has no layout; expose the registered control to real navigation measurement.
  Object.defineProperties(slider, {
    offsetParent: { get: () => document.body },
    offsetHeight: { get: () => 100 },
  });
  const input = createInputDispatcher(KEY, [root]);
  disposers.push(input.dispose);
  void act(() => navigation.select("speed"));
  const down = (code: number) => {
    void act(() => input.keydown(code, { preventDefault: vi.fn() }));
  };
  const up = (code: number) => {
    void act(() => input.keyup(code, { preventDefault: vi.fn() }));
  };
  const press = (code: number) => {
    down(code);
    up(code);
  };
  return {
    ...result,
    slider,
    input,
    onAdjust,
    drawer,
    down,
    up,
    press,
    setActive: (active: boolean) => result.rerender(ui(active)),
  };
};

test("pointer and remote activation enter editing; arrows otherwise stay with the drawer", () => {
  const h = harness();
  expect(h.slider.textContent).toContain("OK to adjust");
  h.press(KEY.RIGHT);
  expect(h.drawer).toHaveBeenLastCalledWith("right");
  expect(h.onAdjust).not.toHaveBeenCalled();
  fireEvent.click(h.slider);
  expect(h.slider.dataset.adjusting).toBe("true");
  fireEvent.click(h.slider);
  expect(h.slider.dataset.adjusting).toBeUndefined();
  h.press(KEY.ENTER);
  expect(h.slider.dataset.adjusting).toBe("true");
});

test("held arrows use one fixed step per event and stay out of drawer navigation", () => {
  const h = harness();
  h.press(KEY.ENTER);
  h.drawer.mockClear();
  h.down(KEY.RIGHT);
  h.down(KEY.RIGHT);
  h.down(KEY.RIGHT);
  h.up(KEY.RIGHT);
  h.press(KEY.LEFT);
  expect(h.onAdjust.mock.calls).toEqual([[1], [1], [1], [-1]]);
  expect(h.drawer).not.toHaveBeenCalled();
});

test.each([KEY.ENTER, KEY.BACK, KEY.ESC])("held exit key %s cannot reach the drawer or restart editing", (code) => {
  const h = harness();
  h.down(KEY.ENTER);
  h.down(KEY.ENTER);
  h.up(KEY.ENTER);
  expect(h.slider.dataset.adjusting).toBe("true");
  h.drawer.mockClear();
  h.down(code);
  h.down(code);
  h.up(code);
  expect(h.slider.dataset.adjusting).toBeUndefined();
  expect(h.drawer).not.toHaveBeenCalled();
});

test.each([KEY.UP, KEY.DOWN])("vertical key %s leaves edit mode and bubbles to the drawer", (code) => {
  const h = harness();
  h.press(KEY.ENTER);
  h.drawer.mockClear();
  h.press(code);
  expect(h.slider.dataset.adjusting).toBeUndefined();
  expect(h.drawer).toHaveBeenCalledExactlyOnceWith(code === KEY.UP ? "up" : "down");
});

test("focus loss blocks a held arrow from changing speed or reaching another control", () => {
  const h = harness();
  h.press(KEY.ENTER);
  h.drawer.mockClear();
  h.down(KEY.RIGHT);
  void act(() => navigation.select("preview"));
  h.down(KEY.RIGHT);
  h.up(KEY.RIGHT);
  expect(h.slider.dataset.adjusting).toBeUndefined();
  expect(h.onAdjust).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.drawer).not.toHaveBeenCalled();
  void act(() => navigation.select("speed"));
  h.press(KEY.RIGHT);
  expect(h.drawer).toHaveBeenCalledExactlyOnceWith("right");
});

test("hiding, reopening, idle cancellation and unmount leave no edit state", () => {
  const h = harness();
  h.press(KEY.ENTER);
  h.setActive(false);
  h.setActive(true);
  expect(h.slider.dataset.adjusting).toBeUndefined();
  h.press(KEY.ENTER);
  void act(() => h.input.cancel());
  expect(h.slider.dataset.adjusting).toBeUndefined();
  h.press(KEY.ENTER);
  h.down(KEY.RIGHT);
  h.unmount();
  h.down(KEY.RIGHT);
  h.up(KEY.RIGHT);
  expect(h.onAdjust).toHaveBeenCalledExactlyOnceWith(1);
});

test("pointer arrows make one adjustment without toggling edit mode off", () => {
  const h = harness();
  fireEvent.click(screen.getByRole("button", { name: "Increase Background speed" }));
  fireEvent.click(screen.getByRole("button", { name: "Increase Background speed" }));
  fireEvent.click(screen.getByRole("button", { name: "Decrease Background speed" }));
  expect(h.onAdjust.mock.calls).toEqual([[1], [1], [-1]]);
  expect(h.slider.dataset.adjusting).toBe("true");
  expect(h.slider.getAttribute("aria-valuemin")).toBe("0.25");
  expect(h.slider.getAttribute("aria-valuetext")).toBe("1×");
  const track = h.slider.querySelector('[aria-hidden="true"] > span') as HTMLElement;
  expect(parseFloat(track.style.left)).toBeCloseTo(((1 - 0.25) / (2 - 0.25)) * 100);
});

test("focus activation adjusts immediately and leaves confirm and Back with the parent", () => {
  const h = harness({ activation: "focus" });
  h.press(KEY.RIGHT);
  expect(h.onAdjust).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.drawer).not.toHaveBeenCalled();
  expect(h.slider.querySelector("[data-slider-hint]")).toBeNull();
  h.press(KEY.ENTER);
  h.press(KEY.BACK);
  expect(h.drawer.mock.calls).toEqual([["confirm"], ["back"]]);
});

test("accelerated adjustment resets after release, another action, focus loss and cancellation", ({
  onTestFinished,
}) => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  onTestFinished(() => now.mockRestore());
  const h = harness({ activation: "focus", accelerate: true });
  h.down(KEY.RIGHT);
  now.mockReturnValue(1600);
  h.down(KEY.RIGHT);
  now.mockReturnValue(2100);
  h.down(KEY.RIGHT);
  now.mockReturnValue(2500);
  h.down(KEY.RIGHT);
  h.up(KEY.RIGHT);
  h.down(KEY.RIGHT);
  h.press(KEY.BACK);
  h.down(KEY.RIGHT);
  void act(() => h.input.cancel());
  h.down(KEY.RIGHT);
  h.up(KEY.RIGHT);
  void act(() => navigation.select("preview"));
  void act(() => navigation.select("speed"));
  h.press(KEY.RIGHT);
  expect(h.onAdjust.mock.calls).toEqual([[1], [5], [5], [10], [1], [1], [1], [1]]);
});
