import { createPreviewContinueWatching } from "./createPreviewContinueWatching";
import { createPreviewPlatforms } from "./createPreviewPlatforms";
import { previewAppId } from "./previewApps";

const LEGACY_PREVIEW_STORAGE_SUFFIX = ".demo";
const DEFAULT_HOME_APPS = ["YouTube", "Netflix", "Prime Video", "Disney+"] as const;
const runtime = window.AeroTizen;

// Explicit adapters and native SDK fixtures keep their own setup.
if (!("tizen" in window) && !runtime.platforms) {
  const config = runtime.config;
  try {
    const saved = localStorage.getItem(config.STORAGE_KEY);
    const previousPreview = localStorage.getItem(config.STORAGE_KEY + LEGACY_PREVIEW_STORAGE_SUFFIX);
    if (saved === null && previousPreview !== null) {
      localStorage.setItem(config.STORAGE_KEY, previousPreview);
    }
  } catch {
    // Browser storage is optional; the settings service can still use defaults.
  }
  config.LEGACY_STORAGE_KEYS = [];
  config.DEFAULTS = {
    continueWatching: true,
    glassSettings: true,
    homeCardColumns: 5,
    home: DEFAULT_HOME_APPS.map(previewAppId),
  };
  runtime.platforms = createPreviewPlatforms(() => true);
  runtime.continueWatching = createPreviewContinueWatching(runtime);
}
