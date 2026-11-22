import type { SettingsSnapshot } from "../../contracts/preferences";

export const isDateVisible = (settings: Pick<SettingsSnapshot, "showDate" | "dateFormat">) =>
  settings.showDate && settings.dateFormat !== "none";
