import { launcherConfig } from "../launcherConfig";
import type { LauncherRuntime } from "../platform/tizen/launcherRuntime";

const host: Window & { tizen?: LauncherRuntime["tizen"] } = window;

// Keep any platform overrides registered before the entry loads.
export const launcherRuntime = Object.assign(host.AeroTizen || {}, {
  config: launcherConfig,
  tizen: host.tizen ?? null,
});
host.AeroTizen = launcherRuntime;
