import type { InstalledApp } from "../../contracts/launcher";

import { appCatalog } from "./appCatalog";

const ICON_CACHE_ROOT = "/opt/share/webappservice/apps_icon/";
const ICON_CACHE_PATH = new RegExp("^" + ICON_CACHE_ROOT + "(?:all|FirstScreen)/(\\d+)/");
const STORE_ID = /^\d+$/;
const ICON_CANDIDATES = [
  { directory: "all", sizePx: 304 },
  { directory: "FirstScreen", sizePx: 250 },
] as const;

export interface ArtworkEnvironment {
  readonly tv: boolean;
}

export const packageIcon = (app: Pick<InstalledApp, "icon">) =>
  typeof app.icon === "string" && !ICON_CACHE_PATH.test(app.icon) ? app.icon : "";

export const artworkSources = (app: InstalledApp, { tv }: ArtworkEnvironment): readonly string[] => {
  if (!tv) {
    return [];
  }
  const cachedStoreId = (app.icon || "").match(ICON_CACHE_PATH)?.[1];
  const storeId = app.storeId || cachedStoreId || (STORE_ID.test(app.id) ? app.id : appCatalog.artworkStoreId(app));
  const sources =
    storeId && STORE_ID.test(storeId)
      ? ICON_CANDIDATES.map(
          ({ directory, sizePx }) => ICON_CACHE_ROOT + directory + "/" + storeId + "/" + sizePx + "x" + sizePx + ".png",
        )
      : [];
  if (typeof app.icon === "string" && app.icon && !sources.includes(app.icon)) {
    sources.push(app.icon);
  }
  return sources;
};
