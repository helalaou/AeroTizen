import type { DiagnosticStorage } from "../../contracts/diagnostics";

const MAX_LOG_BYTES = 256 * 1024;
const PRIVATE_DIRECTORY = "wgt-private";
const FILE_URI_PREFIX = "file://";
const LOG_FILENAME = "aerotizen-diagnostics-v1.json";
const PRIVATE_FILE_MODE = 0o600;

export interface DiagnosticsFilesystem {
  readFile(path: string, encoding: "utf8", done: (error: unknown, value: string) => void): void;
  rename(from: string, to: string, done: (error: unknown) => void): void;
  stat(path: string, done: (error: unknown, stat: { readonly size: number }) => void): void;
  unlink(path: string, done: () => void): void;
  writeFile(
    path: string,
    value: string,
    options: { readonly encoding: "utf8"; readonly mode: number },
    done: (error: unknown) => void,
  ): void;
}

export interface DiagnosticsStorageHost {
  readonly filesystem?: {
    resolve?(path: string, done: (directory: { toURI(): string }) => void, failed: () => void, mode: "rw"): void;
  };
}

interface DiagnosticsStorageOptions {
  byteLength(value: string): number;
  readonly fs: DiagnosticsFilesystem;
}

export const openDiagnosticsStore = (
  host: DiagnosticsStorageHost | null,
  ready: (storage: DiagnosticStorage | null) => void,
  options: DiagnosticsStorageOptions,
): void => {
  if (!host?.filesystem?.resolve) {
    ready(null);
    return;
  }
  const { fs, byteLength } = options;
  try {
    host.filesystem.resolve(
      PRIVATE_DIRECTORY,
      (directory) => {
        try {
          const uri = directory.toURI();
          if (uri.indexOf(FILE_URI_PREFIX + "/") !== 0) {
            ready(null);
            return;
          }
          const file = decodeURIComponent(uri.slice(FILE_URI_PREFIX.length)).replace(/\/$/, "") + "/" + LOG_FILENAME;
          ready({
            load: (done) => {
              fs.stat(file, (error, stat) => {
                if (error || stat.size > MAX_LOG_BYTES) {
                  done(null, null);
                  return;
                }
                fs.readFile(file, "utf8", (failure, value) => {
                  done(failure, !failure && byteLength(value) <= MAX_LOG_BYTES ? value : null);
                });
              });
            },
            save: (value, done) => {
              if (byteLength(value) > MAX_LOG_BYTES) {
                done(new Error("Log size limit"));
                return;
              }
              const temporary = file + ".tmp";
              const failed = (error: unknown) => fs.unlink(temporary, () => done(error));
              fs.writeFile(temporary, value, { encoding: "utf8", mode: PRIVATE_FILE_MODE }, (error) => {
                if (error) {
                  failed(error);
                  return;
                }
                fs.rename(temporary, file, (failure) => {
                  if (failure) {
                    failed(failure);
                  } else {
                    done(null);
                  }
                });
              });
            },
          });
        } catch {
          ready(null);
        }
      },
      () => ready(null),
      "rw",
    );
  } catch {
    ready(null);
  }
};
