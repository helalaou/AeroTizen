import type { BackgroundBridge, BackgroundGraphics, BackgroundScene } from "../contracts/backgrounds";
import type { CustomGradient } from "../contracts/preferences";

import { normalizeColour } from "./colours";
import { gradientBackground, normalizeGradient } from "./gradients";
import { preview, SCENES } from "./scenes";

export interface BackgroundState {
  readonly current: BackgroundScene | null;
  readonly speed: number;
  readonly suspended: boolean;
}

interface BackgroundOptions {
  previous?: BackgroundState;
  renderState(state: BackgroundState | null): void;
  webGL: BackgroundGraphics;
}

export const createBackgrounds = (options: BackgroundOptions) => {
  const { previous, renderState, webGL } = options;
  let { current = null, speed = 1, suspended = false } = previous || {};
  const getState = (): BackgroundState => ({ current, speed, suspended });
  const render = () => renderState(getState());
  render();

  const apply = (id: string | undefined, value = speed, customColour?: string, customGradient?: CustomGradient) => {
    speed = value || 1;
    suspended = false;
    const scene = SCENES.find((scene) => scene.id === id) ?? SCENES[0];
    current = scene.id === "custom" ? { ...scene, base: normalizeColour(customColour) } : scene;
    if (scene.id === "custom-gradient") {
      const gradient = normalizeGradient(customGradient);
      current = { ...scene, base: gradientBackground(gradient), gradient };
    }
    render();
  };

  const bridge: BackgroundBridge = {
    list: SCENES,
    webGL,
    apply,
    preview,
    suspend() {
      suspended = true;
      render();
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
    getState,
    dispose: () => renderState(null),
  };
};
