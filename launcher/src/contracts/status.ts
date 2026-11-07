import type { Store } from "../shared/state/createStore";

import type { SettingsValues } from "./preferences";

export type ClockLayout = "compact" | SettingsValues["aeroClockStyle"];

export type SolarPhase = "" | "day" | "sunset" | "night";

export interface WeatherReading {
  readonly at: number;
  readonly code: number;
  readonly solar?: readonly { readonly sunrise: number; readonly sunset: number }[];
}

export interface WeatherPhotoSource {
  currentReading(): WeatherReading | null;
  solarPhase(reading: WeatherReading | null, now: number): SolarPhase;
  subscribe(listener: () => void): () => void;
}

export interface WeatherSnapshot {
  readonly city: string;
  readonly code: number | null;
  readonly showLocation: boolean;
  readonly temperature: number | null;
  readonly visible: boolean;
}

export interface NetworkSnapshot {
  readonly kind: "ethernet" | "wifi" | "offline" | "unknown";
  readonly strength: number | null;
  readonly visible: boolean;
}

export type NetworkReading = Readonly<Omit<NetworkSnapshot, "visible">>;

export interface NetworkPlatform {
  read(done: (reading: NetworkReading) => void): () => void;
  subscribe(listener: () => void): () => void;
}

export interface NetworkService extends Store<NetworkSnapshot> {
  dispose(): void;
  refresh(): void;
  start(): void;
}

export interface StatusStores {
  dispose(): void;
  readonly network: Store<NetworkSnapshot>;
  readonly time: Store<number>;
  readonly weather: Store<WeatherSnapshot>;
}
