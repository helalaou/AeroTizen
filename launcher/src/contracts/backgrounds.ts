import type { Store } from "../shared/state/createStore";

import type { Background } from "./launcher";

export type ParticleKind = "snow" | "rain" | "fireflies";

export type BackgroundScene = Background & { readonly base: string } & (
    | { readonly anim?: undefined }
    | { readonly anim: "blobs"; readonly blobs: readonly string[]; readonly slow?: boolean; readonly stars?: boolean }
    | { readonly anim: "stars" | "waves" }
    | { readonly anim: "particles"; readonly kind: ParticleKind }
  );

export const needsWebGL = (scene: BackgroundScene): boolean =>
  scene.anim === "stars" || scene.anim === "particles" || (scene.anim === "blobs" && scene.stars === true);

export interface BackgroundGraphics extends Store<boolean | undefined> {
  check(): void;
}

export interface BackgroundBridge {
  apply(id: string | undefined, speed?: number): void;
  readonly list: readonly BackgroundScene[];
  preview(background: BackgroundScene): string;
  setSpeed(speed: number): void;
  suspend(): void;
  webGL: BackgroundGraphics;
}
