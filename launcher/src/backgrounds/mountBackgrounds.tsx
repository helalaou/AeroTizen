import { render } from "preact";

import type { BackgroundGraphics } from "../contracts/backgrounds";
import { createStore } from "../shared/state/createStore";

import { BackgroundSceneView } from "./BackgroundSceneView";
import type { BackgroundState } from "./createBackgrounds";
import { createBackgrounds } from "./createBackgrounds";
import { probeWebGL } from "./webglParticles";

export const mountBackgrounds = (layer: HTMLElement, previous?: BackgroundState) => {
  let generation = 0;
  const status = createStore<boolean | undefined>(undefined);
  const webGL: BackgroundGraphics = {
    getSnapshot: status.getSnapshot,
    subscribe: status.subscribe,
    check() {
      if (status.getSnapshot() === undefined) {
        status.set(probeWebGL(layer.ownerDocument));
      }
    },
  };
  return createBackgrounds({
    layer,
    previous,
    webGL,
    renderScene: (scene, speed) =>
      render(
        scene && (
          <BackgroundSceneView key={generation++} scene={scene} speed={speed} webGL={webGL} reportWebGL={status.set} />
        ),
        layer,
      ),
  });
};
