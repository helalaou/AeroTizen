import { createPreviewPlatforms } from "./createPreviewPlatforms";

// Loaded only by browser tests. Each adapter keeps its supplied native SDK
// fixture; features without an SDK receive explicit sample data.
window.AeroTizen = window.AeroTizen || {};
const preview = createPreviewPlatforms(() => true);
window.AeroTizen.platforms = {
  apps: (platform) => (platform.cacheInventory ? platform : (preview.apps?.(platform) ?? platform)),
  inputs: (platform) => (platform.native ? platform : (preview.inputs?.(platform) ?? platform)),
};
