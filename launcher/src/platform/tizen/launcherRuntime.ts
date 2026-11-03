import type { BackgroundBridge } from "../../contracts/backgrounds";
import type {
  AppPresentation,
  ClockService,
  ContinueItem,
  ContinueSource,
  HomeBridge,
  InputSource,
  InstalledApp,
  LauncherConfig,
  SettingsBridge,
} from "../../contracts/launcher";
import type { SettingsSource, WeatherLocation } from "../../contracts/preferences";
import type { NetworkSnapshot, WeatherSnapshot } from "../../contracts/status";
import type { Store } from "../../shared/state/createStore";

// The unmigrated TV services are accessed through this boundary, not a screen's types.
export interface LauncherRuntime {
  applyBackground(): void;
  apps: {
    all: InstalledApp[];
    ready: boolean;
    byId(id: string): InstalledApp | null;
    launch(app: InstalledApp): void;
    openStore(): void;
    playFireplace(): void;
    subscribe(listener: () => void): () => void;
  };
  clearFocus(): void;
  clock: ClockService;
  config: LauncherConfig;
  continueWatching: {
    items: ContinueItem[];
    message: string;
    sources: ContinueSource[];
    open(item: ContinueItem): void;
    subscribe(listener: () => void): () => void;
  };
  hideToast(): void;
  homeScreen?: HomeBridge;
  homewatch: { useSamsungHome(): void; openSamsungHome?(): void };
  i18n?: { t(value: string): string };
  inputs: {
    sources: InputSource[];
    alwaysVisible?(source: InputSource): boolean;
    hasRecognizedDevice?(source: InputSource): boolean;
    isVisible(source: InputSource): boolean;
    label(source: InputSource): string;
    portName(source: InputSource): string;
    refresh(): void;
    show(source: InputSource): void;
    subscribe(listener: () => void): () => void;
  };
  network: Store<NetworkSnapshot> & { updateVisibility(): void; refresh(): void };
  settings: SettingsSource;
  settingsUi?: SettingsBridge;
  tiles: { describe(app: InstalledApp): AppPresentation };
  toast(message: string): void;
}

export interface LauncherPlatform {
  backgrounds: BackgroundBridge;
  weather: Store<WeatherSnapshot> & {
    updateVisibility(): void;
    updateDisplay(): void;
    refresh(): void;
    searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): void;
  };
}

declare global {
  interface Window {
    AeroTizen: LauncherRuntime;
    Backgrounds: LauncherPlatform["backgrounds"];
    Weather: LauncherPlatform["weather"];
  }
}
