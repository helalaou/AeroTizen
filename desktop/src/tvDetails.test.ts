import { describe, expect, it } from "vitest";
import type { SavedTv } from "./contracts";
import { githubIssueUrl, githubReport, rootStatus } from "./tvDetails";

const tv: SavedTv = {
  id: "private-id",
  identity_sha256: "a".repeat(64),
  host: "192.0.2.20",
  developer_host: "192.0.2.10",
  name: "Private living room",
  model: "QE65LS03DAUXXU",
  transport: "paired_root",
  developer_mode: "1",
  launcher_version: "3.0.0",
  launcher_signing_ready: true,
  checked_at: "2026-11-15T09:00:00Z",
  technical_details: {
    model_code: "QE65LS03DAUXXU",
    tizen_version: "9.0.0",
    architecture: "armv7",
    platform: "24_PTM",
    root_runtime_version: "3.0.1",
  },
};

describe("TV report", () => {
  it("distinguishes root access from a Developer Mode connection", () => {
    expect(rootStatus(tv)).toBe("Yes");
    expect(rootStatus({ ...tv, transport: "developer" })).toBe("Unverified");
  });

  it("includes technical details and leaves private state out", () => {
    const report = githubReport(tv, "3.1.1");
    expect(report).toContain("TV model: QE65LS03DAUXXU");
    expect(report).toContain("Tizen version: 9.0.0");
    expect(report).toContain("Root access version: 3.0.1");
    expect(report).toContain("Desktop app version: 3.1.1");
    for (const value of [tv.id, tv.name, tv.host, tv.developer_host, tv.identity_sha256]) {
      expect(report).not.toContain(value);
    }
    const issue = new URL(githubIssueUrl(tv, "3.1.1"));
    expect(issue.searchParams.get("model")).toBe(tv.model);
    expect(issue.searchParams.get("versions")).toBe("Launcher: 3.0.0, Desktop: 3.1.1, Tizen: 9.0.0");
    expect(issue.searchParams.get("diagnostics")).toContain("Rooted: Yes");
    expect(issue.searchParams.get("diagnostics")).not.toContain("Source:");
    for (const value of [tv.id, tv.name, tv.host, tv.developer_host, tv.identity_sha256]) {
      expect(decodeURIComponent(issue.href)).not.toContain(value);
    }
  });

  it("omits unexpected strings even in report fields", () => {
    const unexpectedTv = {
      ...tv,
      launcher_version: "../../unreviewed",
      technical_details: {
        model_code: "private token here",
        tizen_version: "example@email.invalid",
        architecture: "unknown system path",
        platform: "192.0.2.123",
        root_runtime_version: null,
      },
    };
    const issue = new URL(githubIssueUrl(unexpectedTv, "private desktop version"));
    expect(issue.searchParams.get("versions")).toBeNull();
    const report = issue.searchParams.get("diagnostics");
    for (const value of ["unreviewed", "private token", "@email", "system path", "192.0.2.123", "private desktop"]) {
      expect(report).not.toContain(value);
    }
  });
});
