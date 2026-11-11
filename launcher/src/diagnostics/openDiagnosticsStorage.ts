import type { DiagnosticStorage } from "../contracts/diagnostics";

const DATABASE_NAME = "aerotizen.diagnostics.v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "logs";
const RECORD_KEY = "current";
const MAX_STORED_CHARACTERS = 131072;
const LEGACY_IDLE_TIMEOUT_MS = 1000;

export interface DiagnosticsStorageHost {
  indexedDB?: IDBFactory;
  localStorage: Pick<Storage, "getItem" | "removeItem">;
  requestIdleCallback?(callback: () => void, options: { timeout: number }): number;
  setTimeout(callback: () => void, delayMs: number): number;
}

export const openDiagnosticsStorage = (
  host: DiagnosticsStorageHost,
  ready: (storage: DiagnosticStorage | null) => void,
) => {
  let settled = false;
  let legacyRemoved = false;
  const finish = (storage: DiagnosticStorage | null) => {
    if (!settled) {
      settled = true;
      ready(storage);
    }
  };
  const idle = (callback: () => void) => {
    if (host.requestIdleCallback) {
      host.requestIdleCallback(callback, { timeout: LEGACY_IDLE_TIMEOUT_MS });
    } else {
      host.setTimeout(callback, 0);
    }
  };
  try {
    if (!host.indexedDB) {
      finish(null);
      return;
    }
    const request = host.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = request.onblocked = () => finish(null);
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      finish({
        load(done) {
          const legacy = () => {
            let value: string | null = null;
            try {
              value = host.localStorage.getItem(DATABASE_NAME);
            } catch {
              /* optional legacy read */
            }
            done(null, typeof value === "string" && value.length <= MAX_STORED_CHARACTERS ? value : null);
          };
          try {
            const transaction = database.transaction(STORE_NAME, "readonly");
            const read = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
            transaction.oncomplete = () => {
              const value: unknown = read.result;
              if (typeof value === "string" && value.length <= MAX_STORED_CHARACTERS) {
                done(null, value);
              } else {
                idle(legacy);
              }
            };
            transaction.onabort = () => done(transaction.error || new Error("Log read failed"));
          } catch (error) {
            done(error);
          }
        },
        save(value, done) {
          try {
            const transaction = database.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put(value, RECORD_KEY);
            transaction.oncomplete = () => {
              done(null);
              if (!legacyRemoved) {
                legacyRemoved = true;
                idle(() => {
                  try {
                    host.localStorage.removeItem(DATABASE_NAME);
                  } catch {
                    /* optional old log cleanup */
                  }
                });
              }
            };
            transaction.onabort = () => done(transaction.error || new Error("Log write failed"));
          } catch (error) {
            done(error);
          }
        },
      });
    };
  } catch {
    finish(null);
  }
};
