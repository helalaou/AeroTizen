import type {
  AppPresentation,
  Background,
  Clock,
  ContinueSource,
  InstalledApp,
  LauncherConfig,
  SettingsBridge,
  SettingsSource,
  WeatherLocation,
} from "../types";

export interface InputSource {
  editName?: string;
  number?: number;
  type: string;
}

export interface LauncherRuntime {
  applyBackground(): void;
  apps: { all: InstalledApp[]; openStore(): void; subscribe(listener: () => void): () => void };
  clearFocus(): void;
  clock: Clock;
  config: LauncherConfig;
  continueWatching?: {
    sources: ContinueSource[];
    message: string;
    subscribe(listener: () => void): () => void;
  };
  hideToast(): void;
  homeScreen: { render(): void; blur?(): void; focus?(): void };
  homewatch: { useSamsungHome(): void; openSamsungHome?(): void };
  i18n?: { t(value: string): string };
  inputs: {
    sources: InputSource[];
    portName(source: InputSource): string;
    render(): void;
    subscribe(listener: () => void): () => void;
  };
  network: { updateVisibility(): void };
  settings: SettingsSource;
  settingsUi: SettingsBridge;
  tiles: { describe(app: InstalledApp): AppPresentation };
  toast(message: string): void;
}
declare global {
  interface Window {
    AeroTizen: LauncherRuntime;
    Backgrounds: {
      list: Background[];
      preview(background: Background): string;
      setSpeed(speed: number): void;
    };
    Weather: {
      updateVisibility(): void;
      updateDisplay(): void;
      refresh(): void;
      searchLocations(query: string, done: (results: WeatherLocation[] | null) => void): void;
    };
  }
}
