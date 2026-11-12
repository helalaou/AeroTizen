import type { AppsPlatform } from "./apps";
import type { InputsPlatform } from "./inputs";

// Composition can supply adapters without coupling services to a browser or TV.
export interface PlatformOverrides {
  apps?(platform: AppsPlatform): AppsPlatform;
  inputs?(platform: InputsPlatform): InputsPlatform;
}
