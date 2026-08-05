import { describe, it, expect, beforeAll } from "vitest";
import { access, realpath } from "node:fs/promises";
import path from "node:path";
import { createFixtureRepo, tempDir, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { parseWorktreePorcelain } from "./worktrees.js";

async function samePath(a: string, b: string): Promise<boolean> {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

describe("parseWorktreePorcelain", () => {
  it("parses porcelain -z style records", () => {
    const raw = [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /other",
      "HEAD def",
      "detached",
      "locked reason here",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\0");
    const list = parseWorktreePorcelain(raw);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      path: "/repo",
      head: "abc",
      branch: "main",
      detached: false,
    });
    expect(list[1]).toMatchObject({
      path: "/other",
      detached: true,
      locked: true,
      prunable: true,
    });
  });
});

describe("worktrees (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
  });

  it("lists the main worktree", async () => {
    const list = await repo.worktrees.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    let found = false;
    for (const w of list) {
      if (await samePath(w.path, dir)) found = true;
    }
    expect(found).toBe(true);
    const main = list[0];
    expect(main!.branch === "main" || main!.head).toBeTruthy();
  });

  it("adds a worktree from an existing branch", async () => {
    await repo.branches.create({ name: "feature-wt" });
    const wtPath = path.join(await tempDir("gp-wt-"), "feature-wt");
    const added = await repo.worktrees.add({ path: wtPath, branch: "feature-wt" });
    expect(await samePath(added.path, wtPath)).toBe(true);
    expect(added.branch).toBe("feature-wt");
    await access(wtPath);
    const list = await repo.worktrees.list();
    let found = false;
    for (const w of list) {
      if (await samePath(w.path, wtPath)) found = true;
    }
    expect(found).toBe(true);
  });

  it("adds a worktree with a new branch from a ref", async () => {
    const wtPath = path.join(await tempDir("gp-wt-"), "new-branch-wt");
    const added = await repo.worktrees.add({
      path: wtPath,
      branch: "from-main-new",
      createBranch: true,
      startPoint: "main",
    });
    expect(added.branch).toBe("from-main-new");
    await access(wtPath);
    const branches = await repo.branches.list({ includeRemotes: false });
    expect(branches.some((b) => b.name === "from-main-new")).toBe(true);
  });

  it("removes a worktree and updates the list", async () => {
    await repo.branches.create({ name: "to-remove-wt" });
    const wtPath = path.join(await tempDir("gp-wt-"), "to-remove");
    await repo.worktrees.add({ path: wtPath, branch: "to-remove-wt" });
    await repo.worktrees.remove({ path: wtPath });
    const list = await repo.worktrees.list();
    let found = false;
    for (const w of list) {
      if (await samePath(w.path, wtPath)) found = true;
    }
    expect(found).toBe(false);
  });

  it("prunes stale worktree admin data", async () => {
    await repo.branches.create({ name: "prune-me" });
    const wtBase = await tempDir("gp-wt-");
    const wtPath = path.join(wtBase, "prune-target");
    await repo.worktrees.add({ path: wtPath, branch: "prune-me" });
    await repo.worktrees.remove({ path: wtPath, force: true });
    await repo.worktrees.prune();
    const list = await repo.worktrees.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it("can commit in a worktree path on disk", async () => {
    await repo.branches.create({ name: "commit-wt" });
    const wtPath = path.join(await tempDir("gp-wt-"), "commit-wt");
    await repo.worktrees.add({ path: wtPath, branch: "commit-wt" });
    await commitFile(wtPath, git, "extra.txt", "hello", "worktree commit");
    const list = await repo.worktrees.list();
    let wtHead: string | undefined;
    for (const w of list) {
      if (await samePath(w.path, wtPath)) wtHead = w.head;
    }
    expect(wtHead).toBeTruthy();
    await repo.worktrees.remove({ path: wtPath, force: true });
  });
});
