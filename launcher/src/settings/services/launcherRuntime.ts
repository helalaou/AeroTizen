import type { ContinueSource, AppPresentation, Background, Clock, InstalledApp, LauncherConfig, SettingsBridge, SettingsSource, WeatherLocation } from '../types';

export interface InputSource { type: string; number?: number; editName?: string }

export interface LauncherRuntime {
  i18n?: { t(value: string): string };
  config: LauncherConfig;
  settings: SettingsSource;
  clock: Clock;
  network: { updateVisibility(): void };
  inputs: { sources: InputSource[]; portName(source: InputSource): string; render(): void; subscribe(listener: () => void): () => void };
  continueWatching?: { sources: ContinueSource[]; message: string; subscribe(listener: () => void): () => void };
  homeScreen: { render(): void; blur?(): void; focus?(): void };
  apps: { all: InstalledApp[]; openStore(): void; subscribe(listener: () => void): () => void };
  homewatch: { useSamsungHome(): void; openSamsungHome?(): void };
  tiles: { describe(app: InstalledApp): AppPresentation };
  settingsUi: SettingsBridge;
  clearFocus(): void; toast(message: string): void; hideToast(): void; applyBackground(): void;
}
declare global {
  interface Window {
    AeroTizen: LauncherRuntime;
    Backgrounds: { list: Background[]; preview(background: Background): string; setSpeed(speed: number): void };
    Weather: {
      updateVisibility(): void; updateDisplay(): void; refresh(): void;
      searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): void;
    };
  }
}
