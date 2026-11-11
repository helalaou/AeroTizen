import type { DiagnosticStorage } from "../contracts/diagnostics";

import type { DiagnosticsFilesystem, DiagnosticsStorageHost } from "./service/openDiagnosticsStore";
import { openDiagnosticsStore } from "./service/openDiagnosticsStore";

declare const require: (name: "fs") => DiagnosticsFilesystem;
declare const Buffer: { byteLength(value: string, encoding: "utf8"): number };

const fs = require("fs");

export default (host: DiagnosticsStorageHost | null, ready: (storage: DiagnosticStorage | null) => void): void =>
  openDiagnosticsStore(host, ready, { fs, byteLength: (value) => Buffer.byteLength(value, "utf8") });
