import type { CacheStorage } from "./createBackdropCache";
import { createBackdropCache } from "./createBackdropCache";

const MISS_CACHE_SUFFIX = ".misses";
const MISS_REFERENCE = "no-match";
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

export const createCinemetaMissCache = (storageKey: string, now: () => number, storage?: CacheStorage) => {
  const cache = createBackdropCache(
    storageKey + MISS_CACHE_SUFFIX,
    (reference) => (reference === MISS_REFERENCE ? reference : undefined),
    now,
    storage,
    MISS_TTL_MS,
  );
  return {
    has: (matchKey: string) => cache.get(matchKey) === MISS_REFERENCE,
    remember: (matchKey: string) => cache.remember(matchKey, MISS_REFERENCE),
  };
};
