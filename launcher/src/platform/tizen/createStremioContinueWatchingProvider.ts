import type { AppsService } from "../../contracts/apps";
import type { ContinueWatchingProvider } from "../../contracts/continueWatching";

const STREMIO_APP_ID = "IkWsFHtOY9.Stremio";
const BRIDGE_ORIGIN = "http://127.0.0.1:47791";
const BRIDGE_PATHS = {
  capabilities: "/v1/capabilities",
  credential: "/v1/credential",
  items: "/v1/stremio/items",
} as const;
const CREDENTIAL_FILE = "wgt-private/stremio-feed.json";
const SCHEMA_VERSION = 1;
const HTTP_STATUS = { ok: 200, noContent: 204, unauthorized: 401 } as const;
const TOKEN_HEADER = "X-AeroTizen-Token";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const REQUEST_TIMEOUT_MS = 1_800;
const CREDENTIAL_TIMEOUT_MS = 2_000;
const MAX_CREDENTIAL_BYTES = 512;
const MAX_CAPABILITIES_CHARACTERS = 4_096;
const MAX_FEED_CHARACTERS = 2_000_000;
const MAX_FEED_RECORDS = 200;
const INITIAL_STATUS = "Not selected";
const IMDB_ID_PATTERN = /^tt[0-9]{7,12}$/;
const BACKGROUND_BASE_URL = "https://images.metahub.space/background/medium/";
const EPISODE_BASE_URL = "https://episodes.metahub.space/";
const EPISODE_IMAGE_FILE = "w780.jpg";

type BridgeRequest =
  | { readonly method: "POST"; readonly path: string }
  | { readonly method: "GET"; readonly path: string; readonly maxResponseCharacters: number };

interface CredentialStream {
  close(): void;
  read(bytes: number): string;
}

interface CredentialFile {
  readonly fileSize: number;
  openStream(mode: "r", done: (stream: CredentialStream) => void, failed: () => void, encoding: "UTF-8"): void;
}

export interface StremioTizen {
  filesystem?: {
    resolve(path: string, done: (file: CredentialFile) => void, failed: () => void, mode: "r"): void;
  };
}

interface Dependencies {
  createRequest(): XMLHttpRequest;
  runtime: {
    apps: Pick<AppsService, "launch">;
    catalog: { storeId(id: string): string | null };
    tiles: { shortName(name: string): string };
    tizen?: StremioTizen | null;
  };
  timers: Pick<Window, "setTimeout" | "clearTimeout">;
}

const protocolRecord = (value: unknown): Readonly<Record<string, unknown>> | null => {
  if (!value || typeof value !== "object" || !("schema_version" in value) || value.schema_version !== SCHEMA_VERSION) {
    return null;
  }
  return value;
};
const credentialToken = (value: unknown) => {
  const record = protocolRecord(value);
  return record && typeof record.token === "string" && TOKEN_PATTERN.test(record.token) ? record.token : "";
};
const availableFor = (value: unknown, appId: string) => {
  const record = protocolRecord(value);
  return (
    !!record &&
    record.root === true &&
    record.stremio_installed === true &&
    record.stremio_readable === true &&
    record.stremio_app_id === appId
  );
};
const withArtwork = (value: unknown): unknown => {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record.content_id !== "string" || !IMDB_ID_PATTERN.test(record.content_id)) {
    return value;
  }
  const season =
    typeof record.season === "number" && Number.isFinite(record.season) && record.season >= 0 ? record.season : 0;
  const episode = record.episode;
  const thumbnail =
    Number.isInteger(season) && typeof episode === "number" && Number.isInteger(episode) && episode > 0
      ? {
          thumbnail_url: EPISODE_BASE_URL + record.content_id + "/" + season + "/" + episode + "/" + EPISODE_IMAGE_FILE,
        }
      : {};
  return { ...record, background_url: BACKGROUND_BASE_URL + record.content_id + "/img", ...thumbnail };
};

export const createStremioContinueWatchingProvider = ({
  runtime,
  createRequest,
  timers,
}: Dependencies): ContinueWatchingProvider => {
  const pending = new Map<XMLHttpRequest, () => void>();
  const pendingTimers = new Set<number>();
  let token = "";
  let appId = "";
  let generation = 0;
  let disposed = false;
  const current = (value: number) => !disposed && value === generation;
  const cancel = () => {
    generation++;
    token = "";
    appId = "";
    pendingTimers.forEach((timer) => timers.clearTimeout(timer));
    pendingTimers.clear();
    const requests = [...pending];
    pending.clear();
    requests.forEach(([request, finish]) => {
      // Invalidate callbacks before abort: TV transports may abort silently or throw.
      finish();
      try {
        request.abort();
      } catch {
        /* Keep releasing the other reads. */
      }
    });
  };
  const request = (options: BridgeRequest, done: (error: boolean, value?: unknown, status?: number) => void) => {
    const version = generation;
    let xhr: XMLHttpRequest;
    try {
      xhr = createRequest();
    } catch {
      done(true);
      return;
    }
    let settled = false;
    const finish = (error: boolean, value?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      pending.delete(xhr);
      if (current(version)) {
        done(error, value, xhr.status);
      }
    };
    pending.set(xhr, () => finish(true));
    xhr.onload = () => {
      if (settled) {
        return;
      }
      if (options.method === "POST") {
        finish(xhr.status !== HTTP_STATUS.noContent);
        return;
      }
      let value: unknown;
      try {
        if (xhr.status !== HTTP_STATUS.ok || xhr.responseText.length > options.maxResponseCharacters) {
          finish(true);
          return;
        }
        value = JSON.parse(xhr.responseText) as unknown;
      } catch {
        finish(true);
        return;
      }
      finish(false, value);
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => finish(true);
    try {
      xhr.open(options.method, BRIDGE_ORIGIN + options.path, true);
      xhr.timeout = REQUEST_TIMEOUT_MS;
      if (options.method === "GET") {
        xhr.setRequestHeader(TOKEN_HEADER, token);
      }
      xhr.send();
    } catch {
      finish(true);
    }
  };
  const credential = (done: (secret: string) => void) => {
    const version = generation;
    let settled = false;
    const timer = timers.setTimeout(() => finish(""), CREDENTIAL_TIMEOUT_MS);
    pendingTimers.add(timer);
    const finish = (value: string) => {
      if (settled) {
        return;
      }
      settled = true;
      timers.clearTimeout(timer);
      pendingTimers.delete(timer);
      if (current(version)) {
        done(value);
      }
    };
    try {
      const filesystem = runtime.tizen?.filesystem;
      if (!filesystem) {
        finish("");
        return;
      }
      filesystem.resolve(
        CREDENTIAL_FILE,
        (file) => {
          if (settled || !current(version)) {
            return;
          }
          if (!(file.fileSize > 0 && file.fileSize <= MAX_CREDENTIAL_BYTES)) {
            finish("");
            return;
          }
          file.openStream(
            "r",
            (stream) => {
              let value = "";
              try {
                if (!settled && current(version)) {
                  value = credentialToken(JSON.parse(stream.read(file.fileSize)) as unknown);
                }
              } catch {
                /* Credentials are optional and stay private. */
              } finally {
                try {
                  stream.close();
                } catch {
                  value = "";
                }
              }
              finish(value);
            },
            () => finish(""),
            "UTF-8",
          );
        },
        () => finish(""),
        "r",
      );
    } catch {
      finish("");
    }
  };
  return {
    discover(inventory) {
      if (disposed) {
        return [];
      }
      return inventory
        .filter((app) => app.show !== false && app.id === STREMIO_APP_ID)
        .map((app) => ({
          id: app.id,
          name: runtime.tiles.shortName(app.name || ""),
          icon: app.iconPath || "",
          storeId: runtime.catalog.storeId(app.id) || "",
          status: INITIAL_STATUS,
        }));
    },
    check(source, done) {
      if (disposed || !runtime.tizen?.filesystem) {
        done(false);
        return;
      }
      const prepare = () =>
        request({ method: "POST", path: BRIDGE_PATHS.credential }, (error) => {
          if (error) {
            done(false);
            return;
          }
          credential((secret) => check(secret, false));
        });
      const check = (secret: string, canPrepare: boolean) => {
        if (!secret) {
          if (canPrepare) {
            prepare();
          } else {
            done(false);
          }
          return;
        }
        token = secret;
        request(
          { method: "GET", path: BRIDGE_PATHS.capabilities, maxResponseCharacters: MAX_CAPABILITIES_CHARACTERS },
          (error, value, status) => {
            if (status === HTTP_STATUS.unauthorized && canPrepare) {
              token = "";
              prepare();
              return;
            }
            if (error || !availableFor(value, source.id)) {
              token = "";
              done(false);
              return;
            }
            appId = source.id;
            done(true);
          },
        );
      };
      credential((secret) => check(secret, true));
    },
    read(source, done) {
      if (disposed || !token || source.id !== appId) {
        done(true);
        return;
      }
      request(
        { method: "GET", path: BRIDGE_PATHS.items, maxResponseCharacters: MAX_FEED_CHARACTERS },
        (error, value) => {
          const record = protocolRecord(value);
          if (error || !record || !Array.isArray(record.records)) {
            token = "";
            done(true);
            return;
          }
          done(false, (record.records as unknown[]).slice(0, MAX_FEED_RECORDS).map(withArtwork));
        },
      );
    },
    open(item) {
      if (!disposed) {
        runtime.apps.launch({ id: item.sourceId, name: item.sourceName });
      }
    },
    cancel,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancel();
    },
  };
};
