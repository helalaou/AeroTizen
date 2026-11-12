import type { DiagnosticData, DiagnosticsPrivacy, DiagnosticValue } from "../contracts/diagnostics";

import schema from "./privacySchema.json";

const MAX_NUMBER = 10000000000000000;
const MAX_MESSAGE_CHARACTERS = 1024;
const MAX_STACK_CHARACTERS = 4096;
const MAX_STACK_FRAMES = 8;
const MAX_ALIAS_CHARACTERS = 256;
const MAX_ALIASES = 512;
const SESSION_SEED_RANGE = 4294967296;
const SESSION_SEED_HEX_DIGITS = 8;
const ERROR_PATTERNS = [
  { text: "cannot read", code: "property_access_failed" },
  { text: "is not defined", code: "reference_unavailable" },
  { text: "unexpected token", code: "invalid_syntax" },
  { text: "launch denied", code: "launch_denied" },
  { text: "launch failed", code: "launch_failed" },
] as const;
const DETAIL_KEYS = [
  "action",
  "method",
  "duration_ms",
  "mode",
  "operation",
  "app_id",
  "error",
  "reason",
  "status",
  "phase",
  "line",
  "component",
  "version",
  "hidden",
  "operation_id",
  "message",
  "file",
  "column",
  "stack",
  "code",
  "build_id",
  "commit",
  "dirty",
] as const;
const has = (list: readonly unknown[], value: unknown) => list.indexOf(value) >= 0;
const errorCode = (value: unknown) => {
  const text = typeof value === "string" ? value.slice(0, MAX_MESSAGE_CHARACTERS).toLowerCase() : "";
  for (const pattern of ERROR_PATTERNS) {
    if (text === pattern.code || text.indexOf(pattern.text) >= 0) {
      return pattern.code;
    }
  }
  return "detail_omitted";
};
const sourceFile = (value: unknown) => {
  if (typeof value !== "string") {
    return "[unknown source]";
  }
  const name = value.split(/[?#]/)[0].split(/[\\/]/).pop();
  return name && has(schema.source_files, name) ? name : "[unknown source]";
};
const stack = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .slice(0, MAX_STACK_CHARACTERS)
    .split("\n")
    .map((line) => {
      const match = line.match(/(?:^|[\\/])([a-zA-Z0-9_-]+\.(?:js|html|py)):(\d+)(?::(\d+))?/);
      return match && has(schema.source_files, match[1])
        ? match[1] + ":" + match[2] + (match[3] ? ":" + match[3] : "")
        : "";
    })
    .filter(Boolean)
    .slice(0, MAX_STACK_FRAMES)
    .join("\n");
};

export const createDiagnosticsPrivacy = (): DiagnosticsPrivacy => {
  const aliases: Record<string, string> = Object.create(null) as Record<string, string>;
  const keys: string[] = [];
  let serial = 0;
  const seed = ("00000000" + Math.floor(Math.random() * SESSION_SEED_RANGE).toString(16)).slice(
    -SESSION_SEED_HEX_DIGITS,
  );
  const alias = (input: unknown, kind: "app" | "ref") => {
    if (typeof input !== "string" || input.length > MAX_ALIAS_CHARACTERS) {
      return null;
    }
    if (
      (kind === "app" && /^app-[0-9]+$/.test(input)) ||
      (kind !== "app" && /^d-[a-f0-9]{8}-[0-9]+(?:-[0-9]+)?$/.test(input))
    ) {
      return input;
    }
    const key = kind + ":" + input;
    if (!aliases[key]) {
      if (keys.length >= MAX_ALIASES) {
        delete aliases[keys.shift()!];
      }
      serial += 1;
      aliases[key] = kind === "app" ? "app-" + serial : "d-" + seed + "-" + serial;
      keys.push(key);
    }
    return aliases[key];
  };
  const value = (input: unknown, key: string): DiagnosticValue => {
    if (input === null || input === undefined) {
      return null;
    }
    if (has(schema.bools, key)) {
      return typeof input === "boolean" ? input : null;
    }
    if (has(schema.numbers, key)) {
      return typeof input === "number" && isFinite(input) && input >= 0 && input <= MAX_NUMBER ? input : null;
    }
    const choices = (schema.enums as Record<string, readonly string[]>)[key];
    if (choices) {
      return typeof input === "string" && has(choices, input) ? input : null;
    }
    if (key === "app_id") {
      return typeof input === "string" && has(schema.app_ids, input) ? input : alias(input, "app");
    }
    if (key === "id" || key === "session" || key === "operation_id") {
      return alias(input, "ref");
    }
    if (key === "message") {
      return errorCode(input);
    }
    if (key === "error" || key === "error_type") {
      return typeof input === "string" && has(schema.errors, input) ? input : "Error";
    }
    if (key === "reason") {
      if (
        typeof input === "string" &&
        (has(schema.reasons, input) ||
          /^(?:(?:fresh )?Art status: (on|off|unknown)|HomeWatcher HTTP [1-5][0-9]{2})$/.test(input))
      ) {
        return input;
      }
      if (typeof input === "string" && input.indexOf("home pressed in ") === 0) {
        return "home_pressed_in_app";
      }
      return errorCode(input);
    }
    if (key === "file") {
      return sourceFile(input);
    }
    if (key === "stack") {
      return stack(input);
    }
    if (key === "operation") {
      return typeof input === "string" &&
        /^http:\/\/tizen.org\/appcontrol\/operation\/(main|default|view|service)$/.test(input)
        ? input
        : null;
    }
    if (key === "version" || key === "tizen") {
      return typeof input === "string" && /^[0-9]{1,3}(?:\.[0-9]{1,3}){1,3}$/.test(input) ? input : null;
    }
    if (key === "build_id" || key === "commit") {
      return typeof input === "string" && /^[a-f0-9]{40,64}$/.test(input) ? input : null;
    }
    if (key === "firmware") {
      return typeof input === "string" && /^[A-Z0-9][A-Z0-9_.-]{1,127}$/.test(input) && /[0-9]/.test(input)
        ? input
        : null;
    }
    return null;
  };
  return {
    session: "d-" + seed + "-0",
    value,
    event: (name) => (typeof name === "string" && has(schema.events, name) ? name : "diagnostic.unknown"),
    details(data) {
      const result: DiagnosticData = {};
      if (data && typeof data === "object") {
        const input = data as Record<string, unknown>;
        for (const key of DETAIL_KEYS) {
          if (
            Object.prototype.hasOwnProperty.call(input, key) &&
            has(["string", "number", "boolean"], typeof input[key])
          ) {
            result[key] = value(input[key], key);
          }
        }
      }
      return result;
    },
  };
};
