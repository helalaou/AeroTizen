const CACHE_LIMIT = 64;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_CHARACTERS = 256_000;

interface Entry {
  readonly expiresAt: number;
  readonly matchKey?: string;
  readonly reference: string;
}

export type CacheStorage = Pick<Storage, "getItem" | "setItem">;

export const createBackdropCache = (
  storageKey: string,
  imageUrl: (reference: string) => string | undefined,
  now: () => number,
  storage?: CacheStorage,
) => {
  let entries: Map<string, Entry> | undefined;
  const load = () => {
    if (entries) {
      return entries;
    }
    entries = new Map<string, Entry>();
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw || raw.length > MAX_CACHE_CHARACTERS) {
        return entries;
      }
      const stored = JSON.parse(raw) as unknown;
      if (!Array.isArray(stored)) {
        return entries;
      }
      const time = now();
      for (const value of stored.slice(-CACHE_LIMIT) as unknown[]) {
        if (!Array.isArray(value)) {
          continue;
        }
        const [key, asset, expiresAt, matchKey] = value as unknown[];
        if (
          typeof key === "string" &&
          typeof asset === "string" &&
          imageUrl(asset) &&
          typeof expiresAt === "number" &&
          Number.isSafeInteger(expiresAt) &&
          expiresAt > time
        ) {
          entries.set(key, {
            reference: asset,
            expiresAt,
            matchKey: typeof matchKey === "string" ? matchKey : undefined,
          });
        }
      }
    } catch {
      // A disabled or damaged store still permits caching for this launcher session.
    }
    return entries;
  };
  const save = (key: string, entry: Entry, time: number) => {
    const current = load();
    current.forEach((entry, id) => {
      if (entry.expiresAt <= time) {
        current.delete(id);
      }
    });
    current.delete(key);
    if (current.size >= CACHE_LIMIT) {
      const oldest = current.keys().next().value;
      if (oldest !== undefined) {
        current.delete(oldest);
      }
    }
    current.set(key, entry);
    try {
      const data = JSON.stringify(
        [...current].map(([id, entry]) => [id, entry.reference, entry.expiresAt, entry.matchKey]),
      );
      if (data.length <= MAX_CACHE_CHARACTERS) {
        storage?.setItem(storageKey, data);
      }
    } catch {
      // Keep this session's references if persistent storage is unavailable.
    }
  };
  return {
    get(key: string) {
      const entry = load().get(key);
      return entry && entry.expiresAt > now() ? imageUrl(entry.reference) : undefined;
    },
    reuse(key: string, matchKey: string) {
      const time = now();
      for (const entry of load().values()) {
        if (entry.matchKey === matchKey && entry.expiresAt > time) {
          save(key, entry, time);
          return imageUrl(entry.reference);
        }
      }
      return undefined;
    },
    remember(key: string, reference: unknown, matchKey?: string) {
      if (typeof reference !== "string") {
        return undefined;
      }
      const url = imageUrl(reference);
      if (url) {
        const time = now();
        save(key, { reference, expiresAt: time + CACHE_TTL_MS, matchKey }, time);
      }
      return url;
    },
  };
};
