import { describe, it, expect, beforeAll } from "vitest";
import { realpath } from "node:fs/promises";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import { discoverRepos, openRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import type { GitRepository } from "./repository.js";

/**
 * P17: real-git dual-repo discovery — two independent temp repos are both
 * returned by discoverRepos and can be opened independently.
 */
describe("multi-repo discovery (real git, P17)", () => {
  let git: GitBinary;
  let repoA: GitRepository;
  let repoB: GitRepository;
  let dirA: string;
  let dirB: string;

  beforeAll(async () => {
    const a = await createFixtureRepo();
    const b = await createFixtureRepo();
    git = a.git;
    dirA = a.dir;
    dirB = b.dir;
    repoA = a.repo;
    repoB = b.repo;
    await commitFile(dirA, git, "a-only.txt", "A\n", "repo A marker");
    await commitFile(dirB, git, "b-only.txt", "B\n", "repo B marker");
  });

  it("discoverRepos returns both roots from a two-folder workspace", async () => {
    const roots = await discoverRepos([dirA, dirB], git);
    expect(roots.length).toBe(2);
    const resolved = await Promise.all(
      roots.map(async (r) => realpath(r.root).catch(() => r.root)),
    );
    const wantA = await realpath(dirA).catch(() => dirA);
    const wantB = await realpath(dirB).catch(() => dirB);
    expect(resolved).toEqual(expect.arrayContaining([wantA, wantB]));
  });

  it("each repo has independent history via shipped APIs", async () => {
    const aFiles = await repoA.history.recent({ limit: 10 });
    const bFiles = await repoB.history.recent({ limit: 10 });
    expect(aFiles.some((c) => c.subject.includes("repo A marker"))).toBe(true);
    expect(bFiles.some((c) => c.subject.includes("repo B marker"))).toBe(true);
    expect(aFiles.some((c) => c.subject.includes("repo B marker"))).toBe(false);
    expect(bFiles.some((c) => c.subject.includes("repo A marker"))).toBe(false);
  });

  it("openRepository on each root stays isolated", async () => {
    const againA = await openRepository(dirA, git);
    const againB = await openRepository(dirB, git);
    const realA = await realpath(againA.root).catch(() => againA.root);
    const realB = await realpath(againB.root).catch(() => againB.root);
    expect(realA).not.toBe(realB);
    const wtA = await againA.worktrees.list();
    const wtB = await againB.worktrees.list();
    expect(wtA.length).toBeGreaterThanOrEqual(1);
    expect(wtB.length).toBeGreaterThanOrEqual(1);
  });
});
