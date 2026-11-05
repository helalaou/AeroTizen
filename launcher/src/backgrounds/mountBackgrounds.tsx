import { render } from "preact";

import type { BackgroundGraphics } from "../contracts/backgrounds";
import type { WeatherPhotoSource } from "../contracts/status";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createStore } from "../shared/state/createStore";

import { BackgroundSceneView } from "./BackgroundSceneView";
import type { BackgroundState } from "./createBackgrounds";
import { createBackgrounds } from "./createBackgrounds";
import { createWeatherPhoto } from "./createWeatherPhoto";
import { WeatherPhotoView } from "./WeatherPhotoView";
import { probeWebGL } from "./webglParticles";

export const mountBackgrounds = (
  layer: HTMLElement,
  photoHost: HTMLElement,
  runtime: Pick<LauncherRuntime, "inputs" | "settings">,
  weather: WeatherPhotoSource,
  previous?: BackgroundState,
) => {
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
  const backgrounds = createBackgrounds({
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
  const photo = createWeatherPhoto(
    weather,
    () => runtime.settings.weatherPhoto === true && !runtime.inputs.watching,
    window,
  );
  const { getSnapshot } = photo;
  const restoreWallpaper = () => {
    if (!runtime.inputs.watching) {
      backgrounds.bridge.apply(runtime.settings.background, runtime.settings.speed);
    }
  };
  const unsubscribe = photo.subscribe(() => {
    if (!getSnapshot()) {
      restoreWallpaper();
    }
  });
  render(<WeatherPhotoView onVisible={backgrounds.bridge.suspend} photo={photo} />, photoHost);
  return {
    ...backgrounds,
    apply() {
      const previous = getSnapshot();
      photo.update();
      // The subscription restores the wallpaper when an active photo clears.
      if (!previous && !getSnapshot()) {
        restoreWallpaper();
      }
    },
    dispose() {
      unsubscribe();
      photo.dispose();
      render(null, photoHost);
      backgrounds.dispose();
    },
  };
};
