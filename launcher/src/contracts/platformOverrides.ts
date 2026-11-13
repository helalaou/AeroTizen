import type { AppsPlatform } from "./apps";
import type { InputsPlatform } from "./inputs";
import type { NativeNavigation } from "./nativeNavigation";

// Composition can supply adapters without coupling services to a browser or TV.
export interface PlatformOverrides {
  apps?(platform: AppsPlatform): AppsPlatform;
  inputs?(platform: InputsPlatform): InputsPlatform;
  nativeNavigation?(platform: NativeNavigation): NativeNavigation;
}
