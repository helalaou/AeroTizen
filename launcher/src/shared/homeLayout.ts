import type { SettingsSnapshot } from "../contracts/preferences";

export const usesHomeAppRail = (settings: Pick<SettingsSnapshot, "homeLayout" | "homeAppLayout">) =>
  settings.homeLayout === "cinema" || settings.homeAppLayout === "scroll";
