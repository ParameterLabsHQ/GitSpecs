import { describe, it, expect } from "vitest";
import {
  resolveCommitUrl,
  historyCommitActions,
  formatHistoryPickLabel,
  toHistoryCommitItem,
} from "./actions.js";
import type { HistoryCommit } from "@gitspecs/git-core";

describe("resolveCommitUrl", () => {
  it("builds GitHub commit URL from remote", () => {
    const url = resolveCommitUrl(
      "https://github.com/ParameterLabsHQ/GitSpecs.git",
      "abcdef0123456789abcdef0123456789abcdef01",
    );
    expect(url).toBe(
      "https://github.com/ParameterLabsHQ/GitSpecs/commit/abcdef0123456789abcdef0123456789abcdef01",
    );
  });

  it("returns undefined for unparseable remote", () => {
    expect(resolveCommitUrl("not-a-url", "abc")).toBeUndefined();
    expect(resolveCommitUrl(undefined, "abc")).toBeUndefined();
    expect(resolveCommitUrl("https://github.com/o/r.git", "")).toBeUndefined();
  });
});

describe("historyCommitActions", () => {
  it("always includes copySha, viewAtRev, and revision diffs", () => {
    const ids = historyCommitActions(false).map((a) => a.id);
    expect(ids).toContain("copySha");
    expect(ids).toContain("viewAtRev");
    expect(ids).toContain("diffWithPrevious");
    expect(ids).toContain("diffWithWorking");
    expect(ids).not.toContain("openCommitUrl");
  });

  it("includes openCommitUrl when remote URL available", () => {
    const ids = historyCommitActions(true).map((a) => a.id);
    expect(ids).toContain("openCommitUrl");
  });
});

describe("formatHistoryPickLabel", () => {
  it("includes short sha, subject, author", () => {
    const commit: HistoryCommit = {
      sha: "abcdef0123456789",
      subject: "fix bug",
      author: "Ada",
      authorTime: 1700000000,
    };
    const pick = formatHistoryPickLabel(commit);
    expect(pick.label).toContain("abcdef0");
    expect(pick.label).toContain("fix bug");
    expect(pick.description).toBe("Ada");
    expect(pick.detail).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toHistoryCommitItem", () => {
  it("maps commit + path", () => {
    const item = toHistoryCommitItem(
      {
        sha: "deadbeef",
        subject: "s",
        author: "a",
        authorTime: 1,
      },
      "src/x.ts",
    );
    expect(item).toEqual({
      sha: "deadbeef",
      subject: "s",
      author: "a",
      authorTime: 1,
      filePath: "src/x.ts",
    });
  });
});
