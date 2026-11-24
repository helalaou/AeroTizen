import type { LauncherRelease } from "../contracts";
import { nativeService } from "../services/native";

const REPOSITORY = "helalaou/AeroTizen";
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases`;
const DOWNLOAD_PREFIX = `https://github.com/${REPOSITORY}/releases/download/`;
const TAG_PREFIX = "launcher-v";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export const CATALOG_TIMEOUT_MS = 30_000;
const MAX_NOTES_CHARACTERS = 8_000;
// eslint-disable-next-line no-control-regex -- Match Python splitlines and the native release-note contract.
const NOTE_LINE_SEPARATORS = /[\r\n\v\f\x1c-\x1e\u0085\u2028\u2029]/;
const STABLE_VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}$/;
// Match the Rust/Python note parser, including Python's extra whitespace characters.
const SPACE = "[\\t-\\r\\x1c-\\x20\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const TRIM = new RegExp(`^${SPACE}+|${SPACE}+$`, "g");
const HEADING = new RegExp(`^#{3,6}${SPACE}+(.+)$`);
const BULLET = new RegExp(`^[-*+]${SPACE}+(.+)$`);
const CHANGE_REFERENCE = new RegExp(
  `${SPACE}*\\(\\[[^\\]]+\\]\\(https://github\\.com/[^)]+\\)\\)|,?${SPACE}+(?:closes|fixes|resolves)${SPACE}+\\[#[0-9]+\\]\\(https://github\\.com/[^)]+\\).*$`,
  "gi",
);
const COMPONENT = new RegExp(`^\\*\\*[^*]+:\\*\\*${SPACE}*`);

function unavailable(): Error {
  return new Error("Could not load launcher versions from GitHub.");
}
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function releaseSections(body: unknown): LauncherRelease["sections"] {
  if (typeof body !== "string") return [];
  const sections: LauncherRelease["sections"] = [];
  let heading: string | null = null;
  let changes: string[] = [];
  for (const raw of Array.from(body).slice(0, MAX_NOTES_CHARACTERS).join("").split(NOTE_LINE_SEPARATORS)) {
    const line = raw.replace(TRIM, "");
    const title = HEADING.exec(line)?.[1];
    if (title) {
      if (changes.length) sections.push({ heading, changes });
      heading = title;
      changes = [];
    } else {
      const bullet = BULLET.exec(line)?.[1];
      if (!bullet) continue;
      const change = bullet
        .replace(CHANGE_REFERENCE, "")
        .replace(COMPONENT, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(
          /\*\*([^*]+)\*\*|`([^`]+)`/g,
          (_, bold: string | undefined, code: string | undefined) => bold ?? code ?? "",
        )
        .replace(TRIM, "");
      if (change) changes.push(change);
    }
  }
  if (changes.length) sections.push({ heading, changes });
  return sections;
}

function compareVersions(left: string, right: string): number {
  const other = right.split(".");
  for (const [index, part] of left.split(".").entries()) {
    const next = other[index]!;
    if (part.length !== next.length) return part.length - next.length;
    if (part !== next) return part < next ? -1 : 1;
  }
  return 0;
}
function hasAsset(release: Record<string, unknown>, tag: string, name: string): boolean {
  if (!Array.isArray(release.assets)) return false;
  const matches = release.assets.map(object).filter((asset) => asset?.name === name);
  const url = matches[0]?.browser_download_url;
  return (
    matches.length === 1 &&
    typeof url === "string" &&
    url.slice(0, DOWNLOAD_PREFIX.length).toLowerCase() === DOWNLOAD_PREFIX.toLowerCase() &&
    url.slice(DOWNLOAD_PREFIX.length) === `${tag}/${name}`
  );
}

/** Browser counterpart of the native catalogue; both use the same compatibility fixtures. */
export function githubReleaseEntries(document: unknown): LauncherRelease[] {
  if (!Array.isArray(document)) throw unavailable();
  const entries = new Map<string, LauncherRelease>();
  for (const value of document) {
    const release = object(value);
    if (!release) throw unavailable();
    if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string") continue;
    const tag = release.tag_name;
    const version = tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : "";
    if (
      !STABLE_VERSION.test(version) ||
      entries.has(version) ||
      !hasAsset(release, tag, "launcher-release.json") ||
      !hasAsset(release, tag, `aerotizen-launcher-${version}.wgt`)
    )
      continue;
    entries.set(version, { version, sections: releaseSections(release.body) });
  }
  return [...entries.values()].sort((left, right) => compareVersions(right.version, left.version));
}

async function pageDocument(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_PAGE_BYTES) throw unavailable();
      text += decoder.decode(chunk.value, { stream: true });
    }
    signal.throwIfAborted();
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function fetchGithubReleases(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<LauncherRelease[]> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, CATALOG_TIMEOUT_MS);
  const entries = new Map<string, LauncherRelease>();
  let size = 2;
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await fetcher(`${RELEASES_URL}?per_page=${PAGE_SIZE}&page=${page}`, {
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw unavailable();
      }
      const document = await pageDocument(response, controller.signal);
      for (const release of githubReleaseEntries(document)) {
        if (entries.has(release.version)) continue;
        size += new TextEncoder().encode(JSON.stringify(release)).byteLength + Number(entries.size > 0);
        if (size > MAX_CATALOG_BYTES) throw unavailable();
        entries.set(release.version, release);
      }
      controller.signal.throwIfAborted();
      if (Array.isArray(document) && document.length < PAGE_SIZE) {
        return [...entries.values()].sort((left, right) => compareVersions(right.version, left.version));
      }
    }
    throw unavailable();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

export async function loadPublishedReleases(signal: AbortSignal): Promise<LauncherRelease[]> {
  signal.throwIfAborted();
  if (!("__TAURI_INTERNALS__" in window)) return fetchGithubReleases(signal);
  // Reuse the real read-only Rust command; no other native operation is exposed here.
  const releases = await nativeService.launcherCatalog();
  signal.throwIfAborted();
  return releases;
}
