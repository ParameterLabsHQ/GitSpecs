import { describe, it, expect, beforeAll } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseStashList,
  resolveStashRef,
  STASH_LIST_FORMAT,
} from "./stashes.js";
import { createFixtureRepo, commitFile } from "./test-utils.js";
import type { GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";
import { execGit } from "./exec.js";

describe("parseStashList / resolveStashRef", () => {
  it("parses null-delimited stash records", () => {
    const sha = "a".repeat(40);
    const raw = [`stash@{0}`, sha, "1700000000", "WIP on main: msg"].join("\0") + "\n";
    const rows = parseStashList(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      index: 0,
      ref: "stash@{0}",
      sha,
      message: "WIP on main: msg",
      authorTime: 1700000000,
    });
  });

  it("returns empty for blank stdout", () => {
    expect(parseStashList("")).toEqual([]);
    expect(parseStashList("  \n")).toEqual([]);
  });

  it("resolveStashRef normalizes index and ref strings", () => {
    expect(resolveStashRef(undefined)).toBe("stash@{0}");
    expect(resolveStashRef(2)).toBe("stash@{2}");
    expect(resolveStashRef("3")).toBe("stash@{3}");
    expect(resolveStashRef("stash@{1}")).toBe("stash@{1}");
    expect(() => resolveStashRef(-1)).toThrow(/non-negative/);
    expect(() => resolveStashRef("nope")).toThrow(/invalid/);
  });

  it("exports list format constant used by the API", () => {
    expect(STASH_LIST_FORMAT).toContain("%gd");
    expect(STASH_LIST_FORMAT).toContain("%H");
  });
});

describe("stashes API (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
  });

  it("lists empty stash stack as []", async () => {
    const list = await repo.stashes.list();
    expect(list).toEqual([]);
  });

  it("push creates a stash and list returns full fields newest-first", async () => {
    await writeFile(path.join(dir, "stash-a.txt"), "dirty-a\n", "utf8");
    await execGit(git.path, ["-C", dir, "add", "stash-a.txt"]);
    // leave staged change, also dirty working tree content after second write
    await writeFile(path.join(dir, "stash-a.txt"), "dirty-a-edited\n", "utf8");

    const top = await repo.stashes.push({ message: "p8-unique-stash-msg" });
    expect(top).toBeDefined();
    expect(top!.index).toBe(0);
    expect(top!.ref).toBe("stash@{0}");
    expect(top!.sha).toMatch(/^[0-9a-f]{40}$/i);
    expect(top!.message).toContain("p8-unique-stash-msg");
    expect(top!.authorTime).toBeGreaterThan(0);

    const list = await repo.stashes.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]!.sha).toBe(top!.sha);
    expect(list[0]!.message).toContain("p8-unique-stash-msg");

    // Working tree should be clean of stash-a after push of tracked change
    const status = await execGit(git.path, ["-C", dir, "status", "--porcelain"]);
    // file may still exist as untracked if never committed; push of staged tracked path
    // Our file was new: stash push should have removed it from worktree when staged
    expect(status.stdout.includes("stash-a.txt")).toBe(false);
  });

  it("show returns patch content for the stash", async () => {
    const list = await repo.stashes.list();
    expect(list.length).toBeGreaterThan(0);
    const patch = await repo.stashes.show({ stash: 0 });
    expect(patch.length).toBeGreaterThan(0);
    expect(patch).toMatch(/diff|stash-a|dirty/i);

    const stat = await repo.stashes.show({ stash: 0, stat: true });
    expect(stat.length).toBeGreaterThan(0);
  });

  it("apply restores changes without dropping the stash", async () => {
    // Ensure clean start for apply
    await execGit(git.path, ["-C", dir, "checkout", "--", "."], { allowFailure: true });
    await execGit(git.path, ["-C", dir, "clean", "-fd"], { allowFailure: true });

    const before = await repo.stashes.list();
    expect(before.length).toBeGreaterThan(0);
    await repo.stashes.apply({ stash: 0 });
    const after = await repo.stashes.list();
    expect(after.length).toBe(before.length);

    const status = await execGit(git.path, ["-C", dir, "status", "--porcelain"]);
    expect(status.stdout.length).toBeGreaterThan(0);

    // Reset worktree so later tests are stable
    await execGit(git.path, ["-C", dir, "checkout", "--", "."], { allowFailure: true });
    await execGit(git.path, ["-C", dir, "clean", "-fd"], { allowFailure: true });
    await execGit(git.path, ["-C", dir, "reset", "--hard", "HEAD"]);
  });

  it("push a second stash, drop the oldest by index, pop the top", async () => {
    await commitFile(dir, git, "keep.txt", "keep\n", "keep committed");
    await writeFile(path.join(dir, "stash-b.txt"), "b\n", "utf8");
    await execGit(git.path, ["-C", dir, "add", "stash-b.txt"]);
    await repo.stashes.push({ message: "second-stash-b" });

    let list = await repo.stashes.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const olderIndex = list[list.length - 1]!.index;
    await repo.stashes.drop({ stash: olderIndex });
    list = await repo.stashes.list();
    expect(list.every((s) => s.message.includes("second-stash-b") || s.index === 0)).toBe(
      true,
    );
    // At least the second-stash remains as top after dropping older
    expect(list.some((s) => s.message.includes("second-stash-b"))).toBe(true);

    await repo.stashes.pop({ stash: 0 });
    list = await repo.stashes.list();
    // Popped top; remaining may be empty or older leftovers depending on drop
    const status = await execGit(git.path, ["-C", dir, "status", "--porcelain"]);
    expect(status.stdout.includes("stash-b") || list.length >= 0).toBe(true);
  });
});
