import type { DiagnosticsPrivacy } from "../contracts/diagnostics";

import type { ReadServiceMetadata } from "./service/createDiagnosticsContext";
import {
  createDiagnosticsContext,
  SERVICE_METADATA_LIMIT_BYTES,
  SERVICE_METADATA_PATH,
} from "./service/createDiagnosticsContext";
import type { DiagnosticsFilesystem } from "./service/openDiagnosticsStore";

declare const process: { readonly arch: string } | undefined;
declare const require: {
  (name: "fs"): DiagnosticsFilesystem;
  (name: "./diagnostics"): { createDiagnosticsPrivacy(): DiagnosticsPrivacy };
  (name: "../js/build-info"): unknown;
};

const fs = require("fs");

interface ContextOptions {
  readonly privacy?: DiagnosticsPrivacy;
  readonly read?: ReadServiceMetadata;
}

const readMetadata: ReadServiceMetadata = (done) => {
  fs.stat(SERVICE_METADATA_PATH, (error, stat) => {
    if (error || stat.size > SERVICE_METADATA_LIMIT_BYTES) {
      done(error || new Error("Metadata size limit"));
      return;
    }
    fs.readFile(SERVICE_METADATA_PATH, "utf8", done);
  });
};

export default (options: ContextOptions = {}) => {
  const privacy = options.privacy || require("./diagnostics").createDiagnosticsPrivacy();
  let build: unknown = {};
  try {
    build = require("../js/build-info");
  } catch {
    // Build metadata stays optional for unbuilt or incomplete packages.
  }
  return createDiagnosticsContext({
    privacy,
    build,
    arch: typeof process !== "undefined" ? process.arch : null,
    read: options.read || readMetadata,
  });
};
