import type { Store } from "../shared/state/createStore";

import type { IpControlPlatform, LearnIpControlResult } from "./ipControl";
import type { InputSource } from "./launcher";
import type { NativeHdmiHandoff } from "./nativeNavigation";

export type InputPlayback = "idle" | "opening" | "playing";

export interface InputsSnapshot {
  readonly playback: InputPlayback;
  readonly sources: readonly InputSource[];
  readonly visibleSources: readonly InputSource[];
}

export interface InputsPlatform {
  readonly canEmbed: boolean;
  hide(): void;
  readonly ipControl?: IpControlPlatform;
  isHidden(): boolean;
  readonly native: boolean;
  openNative(source: InputSource, hdmi: NativeHdmiHandoff | null): boolean;
  read(done: (sources: readonly InputSource[] | null) => void): () => void;
  readonly refreshBeforeHdmi: boolean;
  setSource(source: InputSource, done: () => void, failed: () => void): void;
  show(done: () => void, failed: () => void): void;
  subscribeHome(listener: () => void): () => void;
  subscribeSources(listener: () => void): () => void;
  subscribeVisibility(listener: () => void): () => void;
}

export interface InputsService extends Store<InputsSnapshot> {
  alwaysVisible(source: InputSource): boolean;
  canLearnIpControlInput(): boolean;
  dispose(): void;
  hasRecognizedDevice(source: InputSource): boolean;
  isVisible(source: InputSource): boolean;
  label(source: InputSource, defaultLabel?: string): string;
  learnIpControlInput(): Promise<LearnIpControlResult>;
  leave(): void;
  load(done?: (success: boolean) => void): void;
  portName(source: InputSource): string;
  show(source: InputSource | null): void;
  start(): void;
}
