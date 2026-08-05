import { describe, it, expect } from "vitest";
import {
  DEFAULT_COMMITS_LIMIT,
  formatCommitTreeRow,
  truncateSubject,
  commitActions,
} from "./format.js";
import type { HistoryCommit } from "@gitspecs/git-core";

function commit(partial: Partial<HistoryCommit> & Pick<HistoryCommit, "sha">): HistoryCommit {
  return {
    subject: "hello world",
    author: "Ada",
    authorTime: 1_700_000_000,
    ...partial,
  };
}

describe("commits format helpers", () => {
  it("exports a positive default list limit", () => {
    expect(DEFAULT_COMMITS_LIMIT).toBeGreaterThan(0);
    expect(DEFAULT_COMMITS_LIMIT).toBeLessThanOrEqual(10_000);
  });

  it("formats tree row with short sha, subject, author, date", () => {
    const sha = "abcdef0123456789abcdef0123456789abcdef01";
    const row = formatCommitTreeRow(
      commit({ sha, subject: "ship P7", author: "Ada Lovelace", authorTime: 1_700_000_000 }),
    );
    expect(row.label).toContain("abcdef0");
    expect(row.label).toContain("ship P7");
    expect(row.description).toContain("Ada Lovelace");
    expect(row.description).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(row.tooltip).toContain(sha);
    expect(row.tooltip).toContain("ship P7");
  });

  it("uses placeholder subject when empty", () => {
    const row = formatCommitTreeRow(commit({ sha: "a".repeat(40), subject: "" }));
    expect(row.label).toContain("(no subject)");
  });

  it("truncates long subjects for dialogs", () => {
    expect(truncateSubject("short")).toBe("short");
    expect(truncateSubject("")).toBe("");
    expect(truncateSubject("   ")).toBe("");
    const long = "x".repeat(80);
    const t = truncateSubject(long, 20);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t.endsWith("…")).toBe(true);
  });

  it("includes open-remote action only when a host URL exists", () => {
    const without = commitActions(false).map((a) => a.id);
    expect(without).toEqual(["copySha", "checkout", "createBranch"]);
    const withRemote = commitActions(true).map((a) => a.id);
    expect(withRemote).toContain("openRemote");
    expect(withRemote).toContain("copySha");
  });
});
