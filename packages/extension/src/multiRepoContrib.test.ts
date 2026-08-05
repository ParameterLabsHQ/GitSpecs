/**
 * Structural checks for P17 multi-repo tree grouping.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROVIDERS = [
  "worktrees",
  "branches",
  "commits",
  "stashes",
  "tags",
  "remotes",
  "contributors",
  "graph",
] as const;

describe("multi-repo views (P17)", () => {
  it("ships repoTree helpers and design note", () => {
    expect(existsSync(path.join(root, "src/shell/repoTree.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/shell/repoTree.test.ts"))).toBe(true);
    const tree = readFileSync(path.join(root, "src/shell/repoTree.ts"), "utf8");
    expect(tree).toContain("RepoRootItem");
    expect(tree).toContain("resolveRepoForItem");
    expect(tree).toContain("shouldGroupByRepo");

    const design = path.resolve(
      root,
      "../../docs/superpowers/specs/2026-08-05-p17-multi-repo-views.md",
    );
    expect(existsSync(design)).toBe(true);
  });

  it("RepoContext exposes multi-repo helpers", () => {
    const ctx = readFileSync(path.join(root, "src/shell/repoContext.ts"), "utf8");
    expect(ctx).toContain("isMultiRepo");
    expect(ctx).toContain("repoByRoot");
    expect(ctx).toContain("allRepos");
  });

  it("all sidebar providers group under RepoRootItem when multi-repo", () => {
    for (const name of PROVIDERS) {
      const src = readFileSync(path.join(root, `src/modules/${name}/provider.ts`), "utf8");
      expect(src, name).toContain("RepoRootItem");
      expect(src, name).toContain("shouldGroupByRepo");
      expect(src, name).toContain("repoRoot");
      expect(src, name).toContain("repoByRoot");
    }
  });

  it("tree command modules resolve repo from item", () => {
    for (const name of [
      "worktrees",
      "branches",
      "commits",
      "stashes",
      "tags",
      "remotes",
      "graph",
    ] as const) {
      const src = readFileSync(path.join(root, `src/modules/${name}/commands.ts`), "utf8");
      expect(src, name).toContain("resolveRepoForItem");
    }
  });

  it("SCM grouped provider delegates multi-repo getChildren with element", () => {
    const src = readFileSync(path.join(root, "src/shell/scmGroupedProvider.ts"), "utf8");
    expect(src).toContain("getChildren(element");
    expect(src).toContain("WorktreeNode");
    expect(src).toContain("CommitNode");
  });
});
