import type { BackgroundBridge, BackgroundGraphics, BackgroundScene } from "../contracts/backgrounds";

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
  let current = previous?.current ?? null;
  let speed = previous?.speed ?? 1;
  let suspended = previous?.suspended ?? false;

  if (previous) {
    layer.hidden = suspended;
    if (!suspended) {
      renderScene(current, speed);
    }
  }

  const apply = (id: string, value = speed) => {
    speed = value || 1;
    suspended = false;
    current = SCENES.find((scene) => scene.id === id) ?? SCENES[0];
    // Only the root gets a background: a body background would paint over the animated layer.
    document.documentElement.style.background = current.base;
    document.body.style.background = "transparent";
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
    },
    setSpeed(value) {
      const next = value || 1;
      if (next === speed) {
        return;
      }
      speed = next;
      if (current && !suspended) {
        apply(current.id);
      }
    },
  };
  return {
    bridge,
    getState: (): BackgroundState => ({ current, speed, suspended }),
    dispose: () => renderScene(null, speed),
  };
};
