import { launcherRuntime as runtime } from "../app/initializeLauncherRuntime";

import { createPreviewContinueWatching } from "./createPreviewContinueWatching";
import { createPreviewPlatforms } from "./createPreviewPlatforms";
import { previewAppId } from "./previewApps";

const PREVIEW_SMALL_CARD_COLUMNS = 5;
const PREVIEW_MISSING_HDMI_PORT = 5;
const DEFAULT_HOME_APPS = ["YouTube", "Netflix", "Prime Video", "Disney+", "Apple TV", "Stremio"] as const;

// Explicit adapters and native SDK fixtures keep their own setup.
if (!("tizen" in window) && !runtime.platforms) {
  const config = runtime.config;
  runtime.config = {
    ...config,
    DEFAULTS: {
      continueWatching: true,
      theme: "glass",
      homeCardColumns: PREVIEW_SMALL_CARD_COLUMNS,
      homeAppLayout: "scroll",
      home: DEFAULT_HOME_APPS.map(previewAppId),
    },
  };
  runtime.platforms = {
    ...createPreviewPlatforms(() => true, {
      missingHdmiPort: PREVIEW_MISSING_HDMI_PORT,
      notifyInput: (source) =>
        runtime.toast(runtime.translate("inputs.wouldSwitch", { input: runtime.inputs.label(source) })),
    }),
    nativeNavigation: (platform) => ({
      ...platform,
      commands: {
        ...platform.commands,
        openSamsungHome: () => runtime.toast(runtime.translate("handoff.wouldOpenHome")),
      },
    }),
  };
  runtime.continueWatching = createPreviewContinueWatching(runtime);
}
