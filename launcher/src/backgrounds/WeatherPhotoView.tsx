import { useLayoutEffect } from "preact/hooks";

import { useStore } from "../shared/hooks/useStore";
import type { Store } from "../shared/state/createStore";

import type { WeatherPhotoScene } from "./createWeatherPhoto";
import { weatherPhotoUrl } from "./createWeatherPhoto";

interface Props {
  onVisible(): void;
  photo: Store<WeatherPhotoScene | null>;
}

export const WeatherPhotoView = ({ onVisible, photo }: Props) => {
  const scene = useStore(photo);
  useLayoutEffect(() => {
    if (scene) {
      onVisible();
    }
  }, [onVisible, scene]);
  return (
    scene && (
      <div
        id="weather-photo"
        class={"weather-photo scene-" + scene}
        style={{ backgroundImage: `url("${weatherPhotoUrl(scene)}")` }}
      />
    )
  );
};
