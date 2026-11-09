import { render } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import type { BackgroundGraphics } from "../../contracts/backgrounds";
import { createStore } from "../../shared/state/createStore";
import { SCENES } from "../scenes";

import { BackgroundSceneView } from "./BackgroundSceneView";

test("performance mode keeps a static nebula even when WebGL is unavailable", () => {
  const scene = SCENES.find(({ id }) => id === "nebula")!;
  const webGL: BackgroundGraphics = { ...createStore(false), check: vi.fn() };
  const { container } = render(
    <BackgroundSceneView scene={scene} speed={1} webGL={webGL} reportWebGL={vi.fn()} performanceMode />,
  );
  expect(container.querySelectorAll('[data-background-blob][data-static="true"]')).toHaveLength(4);
  expect(container.querySelector("canvas")).toBeNull();
});
