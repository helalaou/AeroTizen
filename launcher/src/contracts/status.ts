import type { Store } from "../shared/state/createStore";

import type { SettingsValues } from "./preferences";

export type ClockLayout = "compact" | SettingsValues["aeroClockStyle"];

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

export interface StatusStores {
  dispose(): void;
  readonly network: Store<NetworkSnapshot>;
  readonly time: Store<number>;
  readonly weather: Store<WeatherSnapshot>;
}
