import type { SavedTv } from "./contracts";

const UNAVAILABLE = "Unavailable";
const GITHUB_ISSUE_URL = "https://github.com/helalaou/AeroTizen/issues/new";
const GITHUB_BUG_TEMPLATE = "bug_report.yml";
const VERSION = /^\d{1,3}(?:\.\d{1,3}){1,2}$/;
const MODEL = /^[A-Z]{2,6}\d[A-Z0-9_-]{2,80}$/;
const PLATFORM = /^(?=.*\d)[A-Z0-9][A-Z0-9_.-]{1,127}$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const ARCHITECTURES = new Set(["arm", "armv7", "armv7l", "aarch64", "arm64", "x86", "x86_64", "x64", "ia32"]);
const HOME_APP_NAMES = new Map([
  ["com.samsung.tv.csfs", "Samsung Home"],
  ["DclHome001.Home", "AeroTizen"],
  ["org.tizen.tv-viewer", "TV viewer"],
]);

export function homeAppLabel(app: string | null): string {
  if (app === null) return UNAVAILABLE;
  if (app === "") return "Not set";
  return HOME_APP_NAMES.get(app) ?? app;
}

export function autostartLabel(value: boolean | null): string {
  if (value === null) return UNAVAILABLE;
  return value ? "On" : "Off";
}

function matches(value: string | null | undefined, pattern: RegExp): string {
  return typeof value === "string" && pattern.test(value) && !IPV4.test(value) ? value : UNAVAILABLE;
}

export function transportLabel(transport: SavedTv["transport"]): string {
  if (transport === "paired_root") return "Paired root bridge";
  if (transport === "developer") return "Developer Mode";
  return UNAVAILABLE;
}

export function developerModeLabel(value: string): string {
  if (value === "1") return "Enabled";
  if (value === "0") return "Disabled";
  return UNAVAILABLE;
}

export function rootStatus(profile: SavedTv): "Yes" | "No" | "Unverified" {
  return profile.transport === "paired_root" ? "Yes" : "Unverified";
}

export function rootVersion(profile: SavedTv): string | null {
  const version = matches(profile.technical_details?.root_runtime_version, VERSION);
  return version === UNAVAILABLE ? null : version;
}

function softwareVersions(profile: SavedTv) {
  return {
    tizen: matches(profile.technical_details?.tizen_version, VERSION),
    launcher: profile.launcher_version === null ? "Not installed" : matches(profile.launcher_version, VERSION),
  };
}

export function softwareRows(profile: SavedTv): [string, string][] {
  const { tizen, launcher } = softwareVersions(profile);
  return [
    ["Tizen version", tizen],
    ["Launcher version", launcher],
  ];
}

export function platformRows(profile: SavedTv): [string, string][] {
  const details = profile.technical_details;
  const architecture = details?.architecture ?? "";
  return [
    ["Architecture", ARCHITECTURES.has(architecture) ? architecture : UNAVAILABLE],
    ["Platform", matches(details?.platform, PLATFORM)],
  ];
}

function modelCode(profile: SavedTv): string {
  return matches(profile.technical_details?.model_code ?? profile.model, MODEL);
}

export function githubReport(profile: SavedTv, backendVersion?: string): string {
  const version = rootVersion(profile);
  const rows: [string, string][] = [
    ["TV model", modelCode(profile)],
    ["Connection method", transportLabel(profile.transport)],
    ["Developer Mode", developerModeLabel(profile.developer_mode)],
    ["Rooted", rootStatus(profile)],
    ...softwareRows(profile),
    ...platformRows(profile),
    ["CLI backend version", matches(backendVersion, VERSION)],
  ];
  if (version) rows.push(["Root helper version", version]);
  const lines = ["### AeroTizen TV details", ""];
  return [...lines, ...rows.map(([label, value]) => `- ${label}: ${value}`), ""].join("\n");
}

export function githubIssueUrl(profile: SavedTv, backendVersion?: string): string {
  const url = new URL(GITHUB_ISSUE_URL);
  url.searchParams.set("template", GITHUB_BUG_TEMPLATE);
  url.searchParams.set("diagnostics", githubReport(profile, backendVersion));
  const model = modelCode(profile);
  if (model !== UNAVAILABLE) url.searchParams.set("model", model);
  const { launcher, tizen } = softwareVersions(profile);
  const versions = [
    ["Launcher", launcher],
    ["CLI", matches(backendVersion, VERSION)],
    ["Tizen", tizen],
  ]
    .filter(([, version]) => version !== UNAVAILABLE)
    .map(([name, version]) => `${name}: ${version}`)
    .join(", ");
  if (versions) url.searchParams.set("versions", versions);
  return url.href;
}
