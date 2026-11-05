import type { SolarPhase, WeatherPhotoSource, WeatherReading } from "../contracts/status";
import { createStore } from "../shared/state/createStore";
import type { WeatherSymbol } from "../shared/weather/conditions";
import { lookupWeather } from "../shared/weather/conditions";

export type WeatherPhotoScene = WeatherSymbol | "night" | "sunset";

export const weatherPhotoUrl = (scene: WeatherPhotoScene) => `assets/weather/${scene}.jpg`;

export const weatherPhotoScene = (reading: WeatherReading | null, phase: SolarPhase): WeatherPhotoScene | null => {
  if (!reading || !Number.isFinite(reading.code) || !phase) {
    return null;
  }
  const { code } = reading;
  if (phase === "night") {
    return phase;
  }
  const known = lookupWeather(code);
  const photo = known && known.symbol;
  if (phase === "sunset" && (photo === "sun" || photo === "partly")) {
    return phase;
  }
  // Photos use one rain scene across the drizzle and rain ranges.
  return photo || (code >= 51 && code <= 67 ? "rain" : "cloud");
};

type PhotoWindow = Pick<Window & typeof globalThis, "Date" | "Image" | "setInterval" | "clearInterval"> & {
  document: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
};

export const createWeatherPhoto = (weather: WeatherPhotoSource, enabled: () => boolean, browser: PhotoWindow) => {
  const { document } = browser;
  const { getSnapshot, set, subscribe } = createStore<WeatherPhotoScene | null>(null);
  let failed: WeatherPhotoScene | null = null;
  let pending: { scene: WeatherPhotoScene; image: HTMLImageElement } | undefined;
  let timer: number | undefined;

  const cancelImage = () => {
    if (pending) {
      pending.image.onload = null;
      pending.image.onerror = null;
      pending = undefined;
    }
  };
  const stop = () => {
    cancelImage();
    browser.clearInterval(timer);
    timer = undefined;
  };
  const load = (next: WeatherPhotoScene | null) => {
    if (pending && next === pending.scene) {
      return;
    }
    cancelImage();
    if (!next) {
      failed = null;
      set(null);
      return;
    }
    if (next === getSnapshot() || next === failed) {
      return;
    }
    const image = new browser.Image();
    pending = { scene: next, image };
    const complete = (loaded: boolean) => {
      if (!pending || pending.image !== image) {
        return;
      }
      cancelImage();
      if (enabled() && !document.hidden) {
        failed = loaded ? null : next;
        set(loaded ? next : null);
      }
    };
    image.onload = () => complete(true);
    image.onerror = () => complete(false);
    image.src = weatherPhotoUrl(next);
  };
  const update = () => {
    const show = enabled();
    if (!show || document.hidden) {
      stop();
      if (!show) {
        load(null);
      }
      return;
    }
    if (!timer) {
      timer = browser.setInterval(update, 60000);
    }
    const reading = weather.currentReading();
    load(weatherPhotoScene(reading, weather.solarPhase(reading, browser.Date.now())));
  };
  const unsubscribe = weather.subscribe(update);
  document.addEventListener("visibilitychange", update);
  return {
    getSnapshot,
    subscribe,
    update,
    dispose() {
      unsubscribe();
      document.removeEventListener("visibilitychange", update);
      stop();
    },
  };
};
