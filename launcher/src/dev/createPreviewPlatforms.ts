import type { IpControlCommand } from "../contracts/ipControl";
import type { InputSource } from "../contracts/launcher";
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

export const createPreviewPlatforms = (
  enabled: () => boolean,
  options: { missingHdmiPort?: number; notifyInput?(source: InputSource): void } = {},
): PlatformOverrides => {
  let learned = false;
  const port = options.missingHdmiPort;
  const ipControl = port
    ? {
        dispose() {},
        request(command: IpControlCommand): Promise<unknown> {
          if (command.action === "learn") {
            const known = learned;
            learned = true;
            return Promise.resolve({ status: known ? "known" : "added", port, ports: [port] });
          }
          if (command.action === "switch") {
            return Promise.resolve({ status: learned && command.port === port ? "switched" : "switchFailed" });
          }
          return Promise.resolve({ status: "listed", ports: learned ? [port] : [] });
        },
      }
    : undefined;
  return {
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
            ipControl,
            openNative(source, hdmi) {
              if (source.ipControl && ipControl) {
                void hdmi?.selectSource?.().then((success) => {
                  if (success) {
                    options.notifyInput?.(source);
                  }
                });
                return true;
              }
              return platform.openNative(source, hdmi);
            },
            read(done) {
              done(previewInputs);
              return () => undefined;
            },
          }
        : platform,
  };
};
