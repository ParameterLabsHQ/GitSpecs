import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { formatConflictGuidance } from "./rewrite.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";
import { DirtyWorktreeError, GitConflictError } from "./errors.js";

describe("formatConflictGuidance", () => {
  it("describes none / conflicts", () => {
    expect(formatConflictGuidance("none", [])).toMatch(/no merge/i);
    expect(formatConflictGuidance("rebase", ["a.ts", "b.ts"])).toMatch(/Conflicted: a\.ts/);
    expect(formatConflictGuidance("cherry-pick", [])).toMatch(/cherry-pick/i);
  });
});

describe("rewrite API (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
  });

  it("status is none on a clean branch", async () => {
    const st = await repo.rewrite.status();
    expect(st.kind).toBe("none");
    expect(st.conflictedPaths).toEqual([]);
  });

  it("guidedRebase refuses dirty worktree when requireClean", async () => {
    await writeFile(path.join(dir, "dirty-rewrite.txt"), "x\n", "utf8");
    await expect(
      repo.rewrite.guidedRebase({ onto: "main", requireClean: true }),
    ).rejects.toBeInstanceOf(DirtyWorktreeError);
    await execGit(git.path, ["-C", dir, "checkout", "--", "."], { allowFailure: true });
    await execGit(git.path, ["-C", dir, "clean", "-fd"], { allowFailure: true });
  });

  it("guidedRebase succeeds on clean divergent branches", async () => {
    await repo.branches.create({ name: "rw-base", startPoint: "main" });
    await repo.branches.switchTo("rw-base");
    await commitFile(dir, git, "rw-base.txt", "base\n", "rw base");
    await repo.branches.create({ name: "rw-topic", startPoint: "rw-base" });
    await repo.branches.switchTo("rw-topic");
    await commitFile(dir, git, "rw-topic.txt", "topic\n", "rw topic");
    await repo.branches.switchTo("rw-base");
    await commitFile(dir, git, "rw-base2.txt", "base2\n", "rw base ahead");
    await repo.branches.switchTo("rw-topic");
    await repo.rewrite.guidedRebase({ onto: "rw-base" });
    const st = await repo.rewrite.status();
    expect(st.kind).toBe("none");
  });

  it("detects cherry-pick conflicts, abort clears state", async () => {
    // Two branches that modify same file differently
    await repo.branches.switchTo("main");
    await commitFile(dir, git, "conflict.txt", "main-line\n", "conflict base on main");
    await repo.branches.create({ name: "rw-a" });
    await repo.branches.switchTo("rw-a");
    await commitFile(dir, git, "conflict.txt", "side-a\n", "conflict side a");
    const shaA = (await execGit(git.path, ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();
    await repo.branches.switchTo("main");
    await repo.branches.create({ name: "rw-b" });
    await repo.branches.switchTo("rw-b");
    await commitFile(dir, git, "conflict.txt", "side-b\n", "conflict side b");

    await expect(
      repo.rewrite.guidedCherryPick({ commits: [shaA] }),
    ).rejects.toBeInstanceOf(GitConflictError);

    const st = await repo.rewrite.status();
    expect(st.kind).toBe("cherry-pick");
    expect(st.conflictedPaths.some((p) => p.includes("conflict"))).toBe(true);

    await repo.rewrite.abort();
    const after = await repo.rewrite.status();
    expect(after.kind).toBe("none");
  });

  it("continue refuses while conflicts remain", async () => {
    await repo.branches.switchTo("main");
    // recreate conflicted cherry-pick lightly if needed — skip if clean
    const st = await repo.rewrite.status();
    if (st.kind === "none") {
      // start a conflicted pick again
      const shaA = (
        await execGit(git.path, ["-C", dir, "rev-parse", "rw-a"])
      ).stdout.trim();
      await repo.branches.switchTo("rw-b");
      try {
        await repo.rewrite.guidedCherryPick({ commits: [shaA] });
      } catch {
        // expected conflict
      }
    }
    const mid = await repo.rewrite.status();
    if (mid.kind !== "none" && mid.conflictedPaths.length > 0) {
      await expect(repo.rewrite.continueOp()).rejects.toThrow(/conflict/i);
      await repo.rewrite.abort();
    }
  });
});
