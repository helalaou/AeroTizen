import { describe, expect, it, vi } from "vitest";
import compatibilityJson from "../../src-tauri/src/services/launcher_catalog/fixtures/cli-compatibility.json?raw";
import { CATALOG_TIMEOUT_MS, fetchGithubReleases, githubReleaseEntries, releaseSections } from "./releaseCatalog";

function release(version: string) {
  const tag = `launcher-v${version}`;
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    body: "### Features\n* Published change.",
    assets: ["launcher-release.json", `aerotizen-launcher-${version}.wgt`].map((name) => ({
      name,
      browser_download_url: `https://github.com/helalaou/AeroTizen/releases/download/${tag}/${name}`,
    })),
  };
}
const signal = () => new AbortController().signal;

describe("Published simulator releases", () => {
  it("matches the real native catalogue and note parser compatibility fixtures", () => {
    const cases = JSON.parse(compatibilityJson) as {
      catalogues: { input: unknown; expected: unknown }[];
      notes: { input: unknown; expected: unknown }[];
    };
    for (const entry of cases.catalogues) expect(githubReleaseEntries(entry.input)).toEqual(entry.expected);
    for (const entry of cases.notes) expect(releaseSections(entry.input)).toEqual(entry.expected);
  });

  it("loads all pages without cookies and sorts/deduplicates published versions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, () => release("3.4.0")))))
      .mockResolvedValueOnce(new Response(JSON.stringify([release("3.5.0"), release("3.4.0")])));
    const result = await fetchGithubReleases(signal(), fetcher);
    expect(result.map((entry) => entry.version)).toEqual(["3.5.0", "3.4.0"]);
    expect(result[0]?.sections[0]?.changes).toEqual(["Published change."]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.github.com/repos/helalaou/AeroTizen/releases?per_page=100&page=1",
      "https://api.github.com/repos/helalaou/AeroTizen/releases?per_page=100&page=2",
    ]);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Accept: "application/vnd.github+json" });
  });

  it("rejects rate limits and malformed/oversized pages instead of returning partial data", async () => {
    for (const response of [
      new Response("Rate limit", { status: 403 }),
      new Response('{"unexpected":true}'),
      new Response(JSON.stringify([null])),
      new Response("[" + " ".repeat(2 * 1024 * 1024) + "]"),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(fetchGithubReleases(signal(), fetcher)).rejects.toThrow();
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, () => release("3.4.0")))))
      .mockRejectedValueOnce(new Error("GitHub unavailable"));
    await expect(fetchGithubReleases(signal(), fetcher)).rejects.toThrow("GitHub unavailable");
  });

  it("cancels a stalled response body and cleans up its deadline", async () => {
    vi.useFakeTimers();
    try {
      const stopped = vi.fn();
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel: stopped })));
      const reading = fetchGithubReleases(signal(), fetcher);
      const rejection = expect(reading).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(CATALOG_TIMEOUT_MS);
      await rejection;
      expect(stopped).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a catalogue when the caller changes scenarios", async () => {
    const controller = new AbortController();
    const stopped = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel: stopped })));
    const reading = fetchGithubReleases(controller.signal, fetcher);
    const rejection = expect(reading).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    expect(stopped).toHaveBeenCalledOnce();
  });
});
