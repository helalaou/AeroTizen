import type { BackgroundBridge, BackgroundGraphics, BackgroundScene } from "../contracts/backgrounds";
import type { CustomGradient } from "../contracts/preferences";

import { isLightColour, normalizeColour } from "./colours";
import { gradientBackground, gradientMidpoint, normalizeGradient } from "./gradients";
import { preview, SCENES } from "./scenes";

export interface BackgroundState {
  readonly current: BackgroundScene | null;
  readonly speed: number;
  readonly suspended: boolean;
}

interface BackgroundOptions {
  layer: HTMLElement;
  previous?: BackgroundState;
  renderScene(scene: BackgroundScene | null, speed: number): void;
  webGL: BackgroundGraphics;
}

export const createBackgrounds = (options: BackgroundOptions) => {
  const { layer, previous, renderScene, webGL } = options;
  const document = layer.ownerDocument;
  let { current = null, speed = 1, suspended = false } = previous || {};

  if (previous) {
    layer.hidden = suspended;
    if (!suspended) {
      renderScene(current, speed);
    }
  }

  const apply = (id: string | undefined, value = speed, customColour?: string, customGradient?: CustomGradient) => {
    speed = value || 1;
    suspended = false;
    const scene = SCENES.find((scene) => scene.id === id) ?? SCENES[0];
    current = scene.id === "custom" ? { ...scene, base: normalizeColour(customColour) } : scene;
    if (scene.id === "custom-gradient") {
      const gradient = normalizeGradient(customGradient);
      current = { ...scene, base: gradientBackground(gradient), gradient };
    }
    // Only the root gets a background: a body background would paint over the animated layer.
    document.documentElement.style.background = current.base;
    document.body.style.background = "transparent";
    document.documentElement.setAttribute(
      "data-light-background",
      String(
        Boolean(
          current.lightBackground ||
          (current.category === "solid" && isLightColour(current.base)) ||
          (current.gradient && isLightColour(gradientMidpoint(current.gradient))),
        ),
      ),
    );
    renderScene(current, speed);
    layer.hidden = false;
  };

  const bridge: BackgroundBridge = {
    list: SCENES,
    webGL,
    apply,
    preview,
    suspend() {
      suspended = true;
      renderScene(null, speed);
      layer.hidden = true;
      document.documentElement.setAttribute("data-light-background", "false");
    },
    setSpeed(value) {
      const next = value || 1;
      if (next === speed) {
        return;
      }
      speed = next;
      if (current && !suspended) {
        apply(current.id, next, current.base, current.gradient);
      }
    },
  };
  return {
    bridge,
    getState: (): BackgroundState => ({ current, speed, suspended }),
    dispose: () => renderScene(null, speed),
  };
};
