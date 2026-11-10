import type { InstalledApp } from "../../contracts/launcher";

import { apps } from "./appCatalog.json";
import { artworkAlias } from "./appNames";

interface AppVariant {
  readonly appId: string;
  readonly preloaded?: boolean;
  readonly sideloaded?: boolean;
  readonly storeId?: string;
}

export interface AppCatalogEntry {
  readonly key: string;
  readonly legacy?: { readonly artworkNames?: readonly string[] };
  readonly name: string;
  readonly variants: readonly AppVariant[];
}

type ArtworkIdentity = Pick<InstalledApp, "id"> & Partial<Pick<InstalledApp, "name">>;

export interface AppCatalog {
  readonly apps: readonly AppCatalogEntry[];
  artworkStoreId(app: ArtworkIdentity): string | null;
  preloadedStoreId(id: string): string | null;
  storeId(id: string): string | null;
}

export const createAppCatalog = (entries: readonly AppCatalogEntry[]): AppCatalog => {
  const byId = new Map<string, string | null>();
  const byName = new Map<string, string | null>();
  const preloaded = new Map<string, string>();
  for (const entry of entries) {
    for (const variant of entry.variants) {
      const storeId = variant.storeId || null;
      if (variant.appId) {
        byId.set(variant.appId, storeId);
      }
      if (variant.storeId) {
        byId.set(variant.storeId, storeId);
      }
      if (variant.preloaded && variant.storeId) {
        preloaded.set(variant.appId, variant.storeId);
      }
    }
    for (const name of entry.legacy?.artworkNames || []) {
      if (!byName.has(name)) {
        byName.set(name, entry.variants[0]?.storeId || null);
      }
    }
  }
  return Object.freeze({
    apps: entries,
    artworkStoreId: (app: ArtworkIdentity) => {
      if (byId.has(app.id)) {
        return byId.get(app.id) || null;
      }
      return byName.get(artworkAlias(app.name || "")) || null;
    },
    preloadedStoreId: (id: string) => preloaded.get(id) || null,
    storeId: (id: string) => byId.get(id) || null,
  });
};

export const appCatalog = createAppCatalog(apps);
