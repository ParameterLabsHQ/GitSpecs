import { describe, it, expect, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseUnifiedDiffHunks,
  mergeAdjacentRanges,
  expandChangedLines,
} from "./changes.js";
import { createFixtureRepo, commitFile, createBareRemote } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("parseUnifiedDiffHunks", () => {
  it("parses added lines in new-file coordinates", () => {
    const diff = [
      "diff --git a/f.txt b/f.txt",
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1,2 +1,4 @@",
      " line1",
      "+line2",
      "+line3",
      " line4",
    ].join("\n");
    const ranges = parseUnifiedDiffHunks(diff, "working");
    expect(ranges).toEqual([{ startLine: 1, endLine: 4, kind: "working" }]);
  });

  it("parses zero-context hunks (git diff -U0)", () => {
    const diff = "@@ -10,0 +11,2 @@\n+a\n+b\n@@ -20 +21 @@\n-old\n+new\n";
    const ranges = parseUnifiedDiffHunks(diff, "unpushed");
    expect(ranges).toContainEqual({ startLine: 11, endLine: 12, kind: "unpushed" });
    // +21 with default count 1
    expect(ranges).toContainEqual({ startLine: 21, endLine: 21, kind: "unpushed" });
  });

  it("omits pure-deletion hunks (new count 0)", () => {
    const diff = "@@ -5,2 +5,0 @@\n-a\n-b\n";
    expect(parseUnifiedDiffHunks(diff, "working")).toEqual([]);
  });

  it("returns empty for blank input", () => {
    expect(parseUnifiedDiffHunks("")).toEqual([]);
    expect(parseUnifiedDiffHunks("   \n")).toEqual([]);
  });
});

describe("mergeAdjacentRanges / expandChangedLines", () => {
  it("merges overlapping and adjacent ranges of the same kind", () => {
    const merged = mergeAdjacentRanges([
      { startLine: 1, endLine: 2, kind: "working" },
      { startLine: 3, endLine: 4, kind: "working" },
      { startLine: 10, endLine: 10, kind: "working" },
      { startLine: 2, endLine: 3, kind: "unpushed" },
    ]);
    expect(merged).toContainEqual({ startLine: 1, endLine: 4, kind: "working" });
    expect(merged).toContainEqual({ startLine: 10, endLine: 10, kind: "working" });
    expect(merged).toContainEqual({ startLine: 2, endLine: 3, kind: "unpushed" });
  });

  it("expands ranges to line numbers", () => {
    const set = expandChangedLines([
      { startLine: 2, endLine: 4, kind: "working" },
      { startLine: 4, endLine: 5, kind: "unpushed" },
    ]);
    expect([...set].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });
});

describe("changes.changedLines (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;

    await commitFile(
      dir,
      git,
      "chg.txt",
      "one\ntwo\nthree\n",
      "chg: initial three lines",
    );
  });

  it("reports working-tree edits via shipped changedLines API", async () => {
    await writeFile(path.join(dir, "chg.txt"), "one\ntwo-mod\nthree\nfour\n", "utf8");
    const ranges = await repo.changes.changedLines("chg.txt", {
      workingTree: true,
      unpushed: false,
    });
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((r) => r.kind === "working")).toBe(true);
    const lines = expandChangedLines(ranges);
    // Modified line 2 and added line 4 should appear in new-file coords
    expect(lines.has(2) || lines.has(4)).toBe(true);
    // Restore clean file for later tests
    await execGit(git.path, ["-C", dir, "checkout", "--", "chg.txt"]);
  });

  it("returns empty when file is clean vs HEAD", async () => {
    const ranges = await repo.changes.changedLines("chg.txt", {
      workingTree: true,
      unpushed: false,
    });
    expect(ranges).toEqual([]);
  });

  it("reports unpushed commit line changes when upstream exists", async () => {
    const bare = await createBareRemote(git);
    await execGit(git.path, ["-C", dir, "remote", "add", "origin", bare]);
    await execGit(git.path, ["-C", dir, "push", "-u", "origin", "main"]);

    // Local commit not pushed
    await commitFile(
      dir,
      git,
      "chg.txt",
      "one\ntwo\nthree\nUNPUSHED\n",
      "chg: unpushed line",
    );

    const ranges = await repo.changes.changedLines("chg.txt", {
      workingTree: false,
      unpushed: true,
    });
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((r) => r.kind === "unpushed")).toBe(true);
    const lines = expandChangedLines(ranges);
    expect(lines.has(4)).toBe(true);

    const upstream = await repo.changes.resolveUpstream();
    expect(upstream).toMatch(/origin/);
  });

  it("skips unpushed when no upstream without throwing", async () => {
    const fixture = await createFixtureRepo();
    await commitFile(
      fixture.dir,
      fixture.git,
      "solo.txt",
      "a\n",
      "solo",
    );
    // No remote — unpushed should be a no-op
    const ranges = await fixture.repo.changes.changedLines("solo.txt", {
      workingTree: false,
      unpushed: true,
    });
    expect(ranges).toEqual([]);
    expect(await fixture.repo.changes.resolveUpstream()).toBeUndefined();
  });
});
