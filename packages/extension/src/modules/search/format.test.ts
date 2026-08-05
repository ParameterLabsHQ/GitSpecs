import { describe, it, expect } from "vitest";
import {
  searchCommitActions,
  formatSearchPickLabel,
  normalizeSearchQuery,
} from "./format.js";
import type { HistoryCommit } from "@gitspecs/git-core";

describe("searchCommitActions", () => {
  it("always includes copySha", () => {
    expect(searchCommitActions(false).map((a) => a.id)).toEqual(["copySha"]);
  });

  it("includes openCommitUrl when remote available", () => {
    expect(searchCommitActions(true).map((a) => a.id)).toEqual([
      "copySha",
      "openCommitUrl",
    ]);
  });
});

describe("formatSearchPickLabel", () => {
  it("includes short sha, subject, author", () => {
    const commit: HistoryCommit = {
      sha: "abcdef0123456789",
      subject: "fix search",
      author: "Ada",
      authorTime: 1700000000,
    };
    const pick = formatSearchPickLabel(commit);
    expect(pick.label).toContain("abcdef0");
    expect(pick.label).toContain("fix search");
    expect(pick.description).toBe("Ada");
    expect(pick.detail).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("normalizeSearchQuery", () => {
  it("returns undefined when both empty", () => {
    expect(normalizeSearchQuery(undefined, undefined)).toBeUndefined();
    expect(normalizeSearchQuery("  ", "")).toBeUndefined();
  });

  it("keeps only non-empty fields", () => {
    expect(normalizeSearchQuery("foo", "  ")).toEqual({ grep: "foo" });
    expect(normalizeSearchQuery("", "Bob")).toEqual({ author: "Bob" });
    expect(normalizeSearchQuery("msg", "Ann")).toEqual({
      grep: "msg",
      author: "Ann",
    });
  });
});
