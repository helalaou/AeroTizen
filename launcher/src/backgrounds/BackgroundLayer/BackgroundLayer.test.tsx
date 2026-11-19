import { act, render } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";

import type { BackgroundScene } from "../../contracts/backgrounds";
import { createStore } from "../../shared/state/createStore";
import type { BackgroundState } from "../createBackgrounds";
import { SCENES } from "../scenes";

import { BackgroundLayer } from "./BackgroundLayer";

afterEach(() => {
  document.documentElement.style.background = "";
  document.body.style.background = "";
  document.documentElement.removeAttribute("data-light-background");
});

const stateFor = (scene: BackgroundScene, suspended = false): BackgroundState => ({
  current: scene,
  speed: 1,
  suspended,
});

test("floating Home text follows the visible wallpaper or Cinema backdrop", async () => {
  const cinemaBackdrop = createStore(false);
  const light: BackgroundScene = { id: "custom", category: "solid", base: "#ffffff" };
  const dark = SCENES.find(({ id }) => id === "black")!;
  const { rerender } = render(
    <BackgroundLayer cinemaBackdrop={cinemaBackdrop} document={document} state={stateFor(light)} />,
  );
  expect(document.documentElement.getAttribute("data-light-background")).toBe("true");
  expect(document.body.style.background).toBe("transparent");
  await act(() => cinemaBackdrop.set(true));
  expect(document.documentElement.getAttribute("data-light-background")).toBe("false");
  expect(document.documentElement.style.background).toBe("rgb(255, 255, 255)");
  await act(() => cinemaBackdrop.set(false));
  expect(document.documentElement.getAttribute("data-light-background")).toBe("true");
  rerender(<BackgroundLayer cinemaBackdrop={cinemaBackdrop} document={document} state={stateFor(dark)} />);
  expect(document.documentElement.style.background).toBe("rgb(0, 0, 0)");
  expect(document.documentElement.getAttribute("data-light-background")).toBe("false");
});

test("suspension removes the scene and preserves native transparency until the wallpaper resumes", () => {
  const cinemaBackdrop = createStore(false);
  const scene: BackgroundScene = { id: "custom", category: "solid", base: "#ffffff" };
  const view = (suspended: boolean) => (
    <BackgroundLayer cinemaBackdrop={cinemaBackdrop} document={document} state={stateFor(scene, suspended)}>
      <canvas />
    </BackgroundLayer>
  );
  const { container, rerender, unmount } = render(view(false));
  const layer = container.querySelector<HTMLElement>("[data-background-host]")!;
  expect(layer.hidden).toBe(false);
  expect(layer.querySelector("canvas")).not.toBeNull();
  expect(document.documentElement.getAttribute("data-light-background")).toBe("true");

  document.documentElement.style.background = "transparent";
  rerender(view(true));
  expect(layer.hidden).toBe(true);
  expect(layer.querySelector("canvas")).toBeNull();
  expect(document.documentElement.style.background).toBe("transparent");
  expect(document.documentElement.getAttribute("data-light-background")).toBe("false");

  rerender(view(false));
  expect(layer.hidden).toBe(false);
  expect(layer.querySelector("canvas")).not.toBeNull();
  expect(document.documentElement.style.background).toBe("rgb(255, 255, 255)");
  expect(document.documentElement.getAttribute("data-light-background")).toBe("true");
  unmount();
  expect(container.querySelector("[data-background-host]")).toBeNull();
});

test("a suspended mount cannot overwrite an active native video background", () => {
  document.documentElement.style.background = "transparent";
  const scene = SCENES.find(({ id }) => id === "pastel")!;
  const { container } = render(
    <BackgroundLayer cinemaBackdrop={createStore(false)} document={document} state={stateFor(scene, true)} />,
  );
  expect(container.querySelector<HTMLElement>("[data-background-host]")!.hidden).toBe(true);
  expect(document.documentElement.style.background).toBe("transparent");
  expect(document.documentElement.getAttribute("data-light-background")).toBe("false");
});
