import type { PlatformOverrides } from "../contracts/platformOverrides";

import { previewApps } from "./previewApps";
import { previewInputs } from "./previewInputs";

const PREVIEW_PACKAGE_ID = "Preview001";
const inventory = Object.freeze(
  previewApps.map((app) =>
    Object.freeze({
      id: app.id,
      name: app.name,
      iconPath: app.icon,
      packageId: PREVIEW_PACKAGE_ID,
    }),
  ),
);

export const createPreviewPlatforms = (enabled: () => boolean): PlatformOverrides => ({
  apps: (platform) =>
    enabled()
      ? {
          ...platform,
          cacheInventory: false,
          readInstalled(done) {
            done(inventory);
            return () => undefined;
          },
        }
      : platform,
  inputs: (platform) =>
    enabled()
      ? {
          ...platform,
          read(done) {
            done(previewInputs);
            return () => undefined;
          },
        }
      : platform,
});
