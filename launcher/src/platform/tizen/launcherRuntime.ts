import type { BackgroundBridge, BackgroundPreview } from "../../contracts/backgrounds";
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
import type { SettingsService, WeatherLocation } from "../../contracts/preferences";
import type { NetworkService, WeatherPhotoSource, WeatherSnapshot } from "../../contracts/status";
import type { MessageKey } from "../../shared/i18n/catalogues";
import type { Translate } from "../../shared/i18n/createTranslations";
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
  clock: ClockService;
  config: LauncherConfig;
  continueWatching: {
    items: ContinueItem[];
    messageKey: MessageKey | "";
    sources: ContinueSource[];
    open(item: ContinueItem): void;
    start(): void;
    subscribe(listener: () => void): () => void;
  };
  hideToast(): void;
  homeScreen?: HomeBridge;
  homewatch: { useSamsungHome(): void; openSamsungHome?(): void };
  inputs: {
    sources: InputSource[];
    watching: boolean;
    alwaysVisible?(source: InputSource): boolean;
    hasRecognizedDevice?(source: InputSource): boolean;
    isVisible(source: InputSource): boolean;
    label(source: InputSource, defaultLabel?: string): string;
    portName(source: InputSource): string;
    refresh(): void;
    show(source: InputSource): void;
    subscribe(listener: () => void): () => void;
  };
  network: NetworkService;
  settings: SettingsService;
  settingsUi?: SettingsBridge;
  tiles: { describe(app: InstalledApp): AppPresentation };
  toast(message: string): void;
  translate: Translate;
}

export interface LauncherPlatform {
  backgrounds: BackgroundBridge;
  previewBackground(preview: BackgroundPreview | null): void;
  weather: Store<WeatherSnapshot> &
    WeatherPhotoSource & {
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
    Fireplace?: {
      close(): void;
      isOpen(): boolean;
      open(): void;
      volumeDown(): void;
      volumeUp(): void;
    };
    Weather: LauncherPlatform["weather"];
  }
}
