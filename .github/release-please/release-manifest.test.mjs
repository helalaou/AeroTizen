import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { releaseManifest } from "./release-manifest.mjs";

const BASE_VERSION = "1.0.0";
const BASE_SHA = "baseline";
const DESKTOP_CHANGE = {
  sha: "desktop",
  message: "feat(desktop): add a desktop feature",
  files: ["desktop/README.md", "cli/src/aerotizen/desktop_worker.py", "launcher/config.xml"],
};

async function candidatesFor(commits) {
  const github = {
    repository: { owner: "helalaou", repo: "AeroTizen" },
    async getFileJson(path) {
      if (path === ".release-please-manifest.json") {
        return { cli: BASE_VERSION, launcher: BASE_VERSION };
      }
      return JSON.parse(await readRepositoryFile(path));
    },
    async getFileContentsOnBranch(path) {
      return { parsedContent: await readRepositoryFile(path) };
    },
    async findFilesByFilenameAndRef() {
      return [];
    },
    async *releaseIterator() {
      yield { tagName: `cli-v${BASE_VERSION}`, sha: `cli-${BASE_SHA}` };
      yield { tagName: `launcher-v${BASE_VERSION}`, sha: `launcher-${BASE_SHA}` };
    },
    async *mergeCommitIterator() {
      yield* commits;
      yield { sha: `cli-${BASE_SHA}`, message: "chore(main): release cli 1.0.0", files: ["cli/CHANGELOG.md"] };
      yield {
        sha: `launcher-${BASE_SHA}`,
        message: "chore(main): release launcher 1.0.0",
        files: ["launcher/CHANGELOG.md"],
      };
    },
  };
  return (await releaseManifest(github, "main")).buildPullRequests();
}

function readRepositoryFile(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("desktop work in both release paths creates no release PR", async () => {
  assert.deepEqual(await candidatesFor([DESKTOP_CHANGE]), []);
});

test("CLI and launcher fixes keep their versions and notes with desktop work in history", async () => {
  const candidates = await candidatesFor([
    DESKTOP_CHANGE,
    { sha: "cli-fix", message: "fix(cli): fix downloads", files: ["cli/src/aerotizen/releases.py"] },
    { sha: "launcher-fix", message: "fix: fix Home startup", files: ["launcher/config.xml"] },
  ]);

  assert.deepEqual(
    candidates.map(({ title }) => title.toString()),
    ["chore(main): release cli 1.0.1", "chore(main): release launcher 1.0.1"],
  );
  assert.match(candidates[0].body.toString(), /fix downloads/);
  assert.match(candidates[1].body.toString(), /fix Home startup/);
  for (const { body } of candidates) {
    assert.doesNotMatch(body.toString(), /add a desktop feature/);
  }
});
