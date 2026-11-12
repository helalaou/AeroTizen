import * as fs from "fs";

import type { DiagnosticsStorageHost } from "../diagnostics/service/openDiagnosticsStore";

import type { HomePreference } from "./createHomeMode";

const PRIVATE_DIRECTORY = "wgt-private";
const FILE_URI_PREFIX = "file://";
const ROUTING_FILENAME = "aerotizen-home-routing-v1.json";
const MAX_ROUTING_BYTES = 4096;
const MAX_ROUTING_CHARACTERS = 4096;
const PRIVATE_FILE_MODE = 0o600;
const FILE_NOT_FOUND = "ENOENT";

const missing = (error: unknown) =>
  error !== null && typeof error === "object" && "code" in error && error.code === FILE_NOT_FOUND;

// Keep file and directory fsync before acknowledging a durable Home handoff.
const openHomeStore = (
  host: DiagnosticsStorageHost | null,
  ready: (store: HomePreference | null, failed: boolean) => void,
  filename = ROUTING_FILENAME,
) => {
  if (!host?.filesystem?.resolve) {
    ready(null, false);
    return;
  }
  try {
    host.filesystem.resolve(
      PRIVATE_DIRECTORY,
      (directory) => {
        try {
          const uri = directory.toURI();
          if (uri.indexOf(FILE_URI_PREFIX + "/") !== 0) {
            throw new Error("Private storage URI unavailable");
          }
          const folder = decodeURIComponent(uri.slice(FILE_URI_PREFIX.length)).replace(/\/$/, "");
          const path = folder + "/" + filename;
          const store: HomePreference = {
            exists: () => {
              try {
                fs.statSync(path);
                return true;
              } catch (error) {
                if (missing(error)) {
                  return false;
                }
                throw error;
              }
            },
            getValue: () => {
              if (fs.statSync(path).size > MAX_ROUTING_BYTES) {
                throw new Error("Home mode file too large");
              }
              return fs.readFileSync(path, "utf8");
            },
            setValue: (_key, value) => {
              if (value.length > MAX_ROUTING_CHARACTERS) {
                throw new Error("Home mode value too large");
              }
              const temporary = path + "." + Date.now() + "-" + Math.random().toString(16).slice(2);
              let failure: unknown = null;
              try {
                const descriptor = fs.openSync(temporary, "wx", PRIVATE_FILE_MODE);
                try {
                  fs.writeFileSync(descriptor, value, "utf8");
                  fs.fsyncSync(descriptor);
                } finally {
                  fs.closeSync(descriptor);
                }
                fs.renameSync(temporary, path);
                const parent = fs.openSync(folder, "r");
                try {
                  fs.fsyncSync(parent);
                } finally {
                  fs.closeSync(parent);
                }
              } catch (error) {
                failure = error;
              }
              try {
                fs.unlinkSync(temporary);
              } catch (error) {
                if (!missing(error) && !failure) {
                  failure = error;
                }
              }
              if (failure) {
                // Preserve the original Node filesystem error and its code.
                throw failure as Error;
              }
            },
          };
          ready(store, false);
        } catch {
          ready(null, true);
        }
      },
      () => ready(null, true),
      "rw",
    );
  } catch {
    ready(null, true);
  }
};

export default openHomeStore;
