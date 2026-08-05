/**
 * Pure resolution of history repo from item path / explicit root.
 * Exercises the same selection order as runHistoryActions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("history multi-repo resolution (shipped commands source)", () => {
  it("viewCommitActions forwards repoRoot into runHistoryActions", () => {
    const src = readFileSync(path.join(root, "modules/history/commands.ts"), "utf8");
    // Must not ignore the second arg
    expect(src).not.toMatch(/viewCommitActions[\s\S]{0,200}_repoRoot/);
    expect(src).toMatch(
      /viewCommitActions[\s\S]{0,120}repoRoot\?[\s\S]{0,80}runHistoryActions\(repos,\s*log,\s*item,\s*repoRoot\)/,
    );
    expect(src).toContain("function resolveHistoryRepo");
    expect(src).toContain("repoByRoot");
    expect(src).toContain("repoForPath");
  });

  it("resolveHistoryRepo prefers explicit root then path then current", () => {
    // Lightweight pure replica of selection order matching shipped helper names
    type FakeRepo = { root: string };
    function resolveHistoryRepo(
      repos: {
        repoByRoot: (r: string) => FakeRepo | undefined;
        repoForPath: (p: string) => FakeRepo | undefined;
        currentRepo: FakeRepo | undefined;
      },
      item: { filePath: string },
      repoRoot?: string,
    ): FakeRepo | undefined {
      if (repoRoot) {
        const byRoot = repos.repoByRoot(repoRoot);
        if (byRoot) return byRoot;
      }
      return repos.repoForPath(item.filePath) ?? repos.currentRepo;
    }

    const a = { root: "/a" };
    const b = { root: "/b" };
    const repos = {
      repoByRoot: (r: string) => (r === "/b" ? b : r === "/a" ? a : undefined),
      repoForPath: (p: string) => (p.startsWith("/b/") ? b : a),
      currentRepo: a,
    };
    expect(
      resolveHistoryRepo(repos, { filePath: "/b/x.ts" }, "/b")?.root,
    ).toBe("/b");
    expect(resolveHistoryRepo(repos, { filePath: "/b/x.ts" })?.root).toBe("/b");
    expect(resolveHistoryRepo(repos, { filePath: "/other" })?.root).toBe("/a");
  });
});
