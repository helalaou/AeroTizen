import type { BackgroundBridge, BackgroundPreview } from "../../contracts/backgrounds";
import type {
  ContinueInstalledApp,
  ContinueWatchingProvider,
  ContinueWatchingService,
} from "../../contracts/continueWatching";
import type {
  AppPresentation,
  ClockService,
  HomeBridge,
  InputSource,
  InstalledApp,
  LauncherConfig,
  SettingsBridge,
} from "../../contracts/launcher";
import type { SettingsService } from "../../contracts/preferences";
import type { NetworkService, WeatherService } from "../../contracts/status";
import type { Translate } from "../../shared/i18n/createTranslations";

// The unmigrated TV services are accessed through this boundary, not a screen's types.
export interface LauncherRuntime {
  applyBackground(): void;
  apps: {
    all: InstalledApp[];
    ready: boolean;
    inventory?: readonly ContinueInstalledApp[];
    byId(id: string): InstalledApp | null;
    launch(app: InstalledApp): void;
    openStore(): void;
    playFireplace(): void;
    subscribe(listener: () => void): () => void;
  };
  clock: ClockService;
  config: LauncherConfig;
  continueWatching: ContinueWatchingService;
  continueWatchingProviders?: readonly ContinueWatchingProvider[];
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
  weather: WeatherService;
}

export interface LauncherPlatform {
  backgrounds: BackgroundBridge;
  previewBackground(preview: BackgroundPreview | null): void;
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
  }
}
