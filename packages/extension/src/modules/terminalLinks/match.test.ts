import { describe, it, expect } from "vitest";
import { findShaLinks, findRefLinks, mergeTerminalHits } from "./match.js";

describe("findShaLinks", () => {
  it("finds hex SHAs of length 7+", () => {
    const hits = findShaLinks("checked out abcdef0 and deadbeefcafebabe");
    expect(hits.map((h) => h.text)).toEqual(
      expect.arrayContaining(["abcdef0", "deadbeefcafebabe"]),
    );
  });

  it("filters to known SHAs when provided", () => {
    const full = "abcdef0123456789abcdef0123456789abcdef01";
    const hits = findShaLinks(`see ${full.slice(0, 7)} and fffffff`, [full]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.sha).toBe(full);
  });
});

describe("findRefLinks", () => {
  it("matches branch and tag names as tokens", () => {
    const hits = findRefLinks("merged feature/foo into main", [
      "main",
      "feature/foo",
      "v1.0.0",
    ]);
    expect(hits.map((h) => h.ref)).toEqual(
      expect.arrayContaining(["feature/foo", "main"]),
    );
  });

  it("prefers longer names", () => {
    const hits = findRefLinks("on feature/foo", ["feature", "feature/foo"]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ref).toBe("feature/foo");
  });
});

describe("mergeTerminalHits", () => {
  it("dedupes overlapping ranges preferring earlier longer", () => {
    const shas = findShaLinks("abcdef0");
    const refs = findRefLinks("abcdef0", ["abcdef0"]); // unlikely but overlap
    const merged = mergeTerminalHits(shas, refs);
    expect(merged.length).toBeGreaterThanOrEqual(1);
    // No overlapping start indices
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i]!.startIndex).toBeGreaterThanOrEqual(
        merged[i - 1]!.startIndex + merged[i - 1]!.length,
      );
    }
  });
});
