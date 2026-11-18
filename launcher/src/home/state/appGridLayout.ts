import type { SettingsSnapshot } from "../../contracts/preferences";
import type { Page } from "../types";

const ALL_APPS_COLUMNS: Readonly<Record<number, number>> = { 5: 6, 4: 5, 3: 4 };

export const getAppGridColumns = (settings: SettingsSnapshot, page: Page = "home") =>
  page === "apps" ? ALL_APPS_COLUMNS[settings.homeCardColumns] : settings.homeCardColumns;
