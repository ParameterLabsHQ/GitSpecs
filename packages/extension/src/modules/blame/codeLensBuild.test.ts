import { describe, it, expect } from "vitest";
import {
  shouldAcceptCodeLensResult,
  buildFileCodeLensSpecs,
} from "./codeLensBuild.js";
import type { BlameLine } from "@gitspecs/git-core";

const ada: BlameLine = {
  lineNumber: 1,
  sha: "deadbeefcafebabe000000000000000000000001",
  author: "Ada",
  authorTime: 1700000000,
  summary: "implement feature",
  content: "a",
};

const bob: BlameLine = {
  lineNumber: 2,
  sha: "abcdef0123456789000000000000000000000002",
  author: "Bob",
  authorTime: 1700003600,
  summary: "fix bug",
  content: "b",
};

describe("shouldAcceptCodeLensResult", () => {
  it("accepts when not cancelled and version still matches", () => {
    expect(
      shouldAcceptCodeLensResult({
        cancelled: false,
        requestedVersion: 3,
        currentVersion: 3,
      }),
    ).toBe(true);
  });

  it("rejects cancelled tokens", () => {
    expect(
      shouldAcceptCodeLensResult({
        cancelled: true,
        requestedVersion: 3,
        currentVersion: 3,
      }),
    ).toBe(false);
  });

  it("rejects when document version advanced (same file superseded)", () => {
    expect(
      shouldAcceptCodeLensResult({
        cancelled: false,
        requestedVersion: 3,
        currentVersion: 4,
      }),
    ).toBe(false);
  });

  it("does not couple independent documents: matching version+token always accepts", () => {
    // Two concurrent provides for different files both use their own versions.
    // There is no shared seq — both shouldAccept calls with their own matching
    // versions remain true even if called in any order.
    const fileA = shouldAcceptCodeLensResult({
      cancelled: false,
      requestedVersion: 1,
      currentVersion: 1,
    });
    const fileB = shouldAcceptCodeLensResult({
      cancelled: false,
      requestedVersion: 99,
      currentVersion: 99,
    });
    // "Later" completion for fileA still valid after fileB completed
    const fileAAgain = shouldAcceptCodeLensResult({
      cancelled: false,
      requestedVersion: 1,
      currentVersion: 1,
    });
    expect(fileA).toBe(true);
    expect(fileB).toBe(true);
    expect(fileAAgain).toBe(true);
  });
});

describe("buildFileCodeLensSpecs", () => {
  it("builds authors + last-change specs from real formatters", () => {
    const specs = buildFileCodeLensSpecs([ada, bob, { ...ada, lineNumber: 3 }]);
    expect(specs.length).toBe(2);
    expect(specs[0]!.title).toBe("2 authors");
    expect(specs[0]!.tooltip).toContain("authors");
    expect(specs[1]!.title).toContain("last change:");
    expect(specs[1]!.title).toContain("fix bug");
    expect(specs[1]!.title).toContain("Bob");
    // Detail payload is latest commit (Bob)
    expect(specs[0]!.payload?.sha).toBe(bob.sha);
    expect(specs[1]!.payload?.sha).toBe(bob.sha);
  });

  it("returns empty for no rows", () => {
    expect(buildFileCodeLensSpecs([])).toEqual([]);
  });
});
