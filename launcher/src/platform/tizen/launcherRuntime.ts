import type { AppsService } from "../../contracts/apps";
import type { BackgroundBridge, BackgroundPreview } from "../../contracts/backgrounds";
import type { ContinueWatchingService } from "../../contracts/continueWatching";
import type { LauncherStartup, UiDiagnostics } from "../../contracts/diagnostics";
import type { FireplaceControls } from "../../contracts/fireplace";
import type { HomeWatcherService } from "../../contracts/homeWatcher";
import type { InputsService } from "../../contracts/inputs";
import type { ClockService, HomeBridge, LauncherConfig, SettingsBridge } from "../../contracts/launcher";
import type { NativeNavigation, NativeNavigationCommands } from "../../contracts/nativeNavigation";
import type { PlatformOverrides } from "../../contracts/platformOverrides";
import type { SettingsService } from "../../contracts/preferences";
import type { NetworkService, WeatherService } from "../../contracts/status";
import type { Translate } from "../../shared/i18n/createTranslations";

import type { AppsTizen } from "./createAppsPlatform";
import type { HomeWatcherTizen } from "./createHomeWatcherPlatform";
import type { InputsTizen } from "./createInputsPlatform";
import type { NativeNavigationTizen } from "./createNativeNavigation";
import type { StremioTizen } from "./createStremioContinueWatchingProvider";

// Shared runtime used by app composition and the Tizen adapters.
export interface LauncherRuntime {
  applyBackground(): void;
  apps: AppsService;
  clock: ClockService;
  config: LauncherConfig;
  continueWatching: ContinueWatchingService;
  hideToast(): void;
  homeScreen?: HomeBridge;
  homewatch: HomeWatcherService & Partial<NativeNavigationCommands>;
  inputs: InputsService;
  nativeNavigation: NativeNavigation;
  network: NetworkService;
  platforms?: PlatformOverrides;
  settings: SettingsService;
  settingsUi?: SettingsBridge;
  tizen?: (AppsTizen & HomeWatcherTizen & InputsTizen & StremioTizen & NativeNavigationTizen) | null;
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
    AeroBuildInfo?: Record<string, unknown>;
    AeroDiagnostics: UiDiagnostics;
    AeroStartup: LauncherStartup;
    AeroTizen: LauncherRuntime;
    Backgrounds: LauncherPlatform["backgrounds"];
    Fireplace?: FireplaceControls;
  }
}
