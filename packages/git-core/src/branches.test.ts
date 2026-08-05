import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import {
  createFixtureRepo,
  createBareRemote,
  commitFile,
  tempDir,
} from "./test-utils.js";
import { execGit } from "./exec.js";
import { openRepository, type GitRepository } from "./repository.js";
import type { GitBinary } from "./git.js";

describe("branches (real git)", () => {
  let git: GitBinary;
  let dir: string;
  let repo: GitRepository;
  let initialSha: string;

  beforeAll(async () => {
    const fixture = await createFixtureRepo();
    git = fixture.git;
    dir = fixture.dir;
    repo = fixture.repo;
    initialSha = fixture.initialSha;
  });

  it("lists local branches with current marker", async () => {
    const list = await repo.branches.list({ includeRemotes: false });
    const main = list.find((b) => b.name === "main");
    expect(main).toBeDefined();
    expect(main!.current).toBe(true);
    expect(main!.remote).toBe(false);
  });

  it("creates, renames, and deletes branches", async () => {
    await repo.branches.create({ name: "topic-a" });
    let list = await repo.branches.list({ includeRemotes: false });
    expect(list.some((b) => b.name === "topic-a")).toBe(true);

    await repo.branches.rename({ oldName: "topic-a", newName: "topic-b" });
    list = await repo.branches.list({ includeRemotes: false });
    expect(list.some((b) => b.name === "topic-b")).toBe(true);
    expect(list.some((b) => b.name === "topic-a")).toBe(false);

    await repo.branches.delete({ name: "topic-b" });
    list = await repo.branches.list({ includeRemotes: false });
    expect(list.some((b) => b.name === "topic-b")).toBe(false);
  });

  it("force-deletes an unmerged branch", async () => {
    await repo.branches.create({ name: "unmerged" });
    await repo.branches.switchTo("unmerged");
    await commitFile(dir, git, "u.txt", "u", "unmerged commit");
    await repo.branches.switchTo("main");
    await expect(repo.branches.delete({ name: "unmerged" })).rejects.toThrow();
    await repo.branches.delete({ name: "unmerged", force: true });
    const list = await repo.branches.list({ includeRemotes: false });
    expect(list.some((b) => b.name === "unmerged")).toBe(false);
  });

  it("checkouts/switches between branches", async () => {
    await repo.branches.create({ name: "switch-me" });
    await repo.branches.checkout({ name: "switch-me" });
    let list = await repo.branches.list({ includeRemotes: false });
    expect(list.find((b) => b.name === "switch-me")?.current).toBe(true);
    await repo.branches.switchTo("main");
    list = await repo.branches.list({ includeRemotes: false });
    expect(list.find((b) => b.name === "main")?.current).toBe(true);
  });

  it("creates a branch from a commit", async () => {
    await repo.branches.createFromCommit({ name: "from-sha", commit: initialSha });
    const list = await repo.branches.list({ includeRemotes: false });
    const b = list.find((x) => x.name === "from-sha");
    expect(b).toBeDefined();
    expect(b!.commit?.startsWith(initialSha.slice(0, 7))).toBe(true);
  });

  it("compares two refs with ahead/behind and shortstat", async () => {
    await repo.branches.create({ name: "compare-a", startPoint: "main" });
    await repo.branches.switchTo("compare-a");
    await commitFile(dir, git, "a.txt", "a\n", "on compare-a");
    await repo.branches.switchTo("main");
    await commitFile(dir, git, "m.txt", "m\n", "on main more");

    const result = await repo.branches.compare({ base: "main", head: "compare-a" });
    expect(typeof result.ahead).toBe("number");
    expect(typeof result.behind).toBe("number");
    expect(result.ahead + result.behind).toBeGreaterThan(0);
    // shortstat may be empty if renames only, but we changed files so expect content
    expect(typeof result.shortstat).toBe("string");
  });

  it("merges a non-conflicting branch", async () => {
    await repo.branches.create({ name: "merge-me" });
    await repo.branches.switchTo("merge-me");
    await commitFile(dir, git, "merge.txt", "merged\n", "merge commit");
    await repo.branches.switchTo("main");
    await repo.branches.merge({ ref: "merge-me" });
    const headMsg = (await execGit(git.path, ["-C", dir, "log", "-1", "--format=%s"])).stdout.trim();
    expect(headMsg.length).toBeGreaterThan(0);
  });

  it("rebases a branch onto main", async () => {
    await repo.branches.switchTo("main");
    await commitFile(dir, git, "base-r.txt", "base\n", "base for rebase");
    await repo.branches.create({ name: "rebase-me" });
    await repo.branches.switchTo("rebase-me");
    await commitFile(dir, git, "rebased.txt", "r\n", "rebased commit");
    await repo.branches.switchTo("main");
    await commitFile(dir, git, "main-r.txt", "mr\n", "main ahead for rebase");
    await repo.branches.switchTo("rebase-me");
    await repo.branches.rebase({ onto: "main" });
    const log = (await execGit(git.path, ["-C", dir, "log", "--oneline", "-5"])).stdout;
    expect(log).toContain("rebased commit");
    await repo.branches.switchTo("main");
  });

  it("cherry-picks a commit", async () => {
    await repo.branches.create({ name: "cherry-src" });
    await repo.branches.switchTo("cherry-src");
    const sha = await commitFile(dir, git, "cherry.txt", "c\n", "cherry subject");
    await repo.branches.switchTo("main");
    await repo.branches.cherryPick({ commits: [sha] });
    const show = (await execGit(git.path, ["-C", dir, "show", "--name-only", "--pretty=format:"])).stdout;
    expect(show).toContain("cherry.txt");
  });

  it("surfaces real failure for conflict (non-mocked)", async () => {
    await repo.branches.create({ name: "conflict-a" });
    await repo.branches.switchTo("conflict-a");
    await commitFile(dir, git, "conflict.txt", "A\n", "conflict A");
    await repo.branches.switchTo("main");
    await repo.branches.create({ name: "conflict-b" });
    await repo.branches.switchTo("conflict-b");
    await commitFile(dir, git, "conflict.txt", "B\n", "conflict B");
    await expect(repo.branches.merge({ ref: "conflict-a" })).rejects.toThrow();
    // abort merge to clean up
    await execGit(git.path, ["-C", dir, "merge", "--abort"], { allowFailure: true });
    await repo.branches.switchTo("main");
  });

  it("publish/push/fetch/pull/delete-remote against local bare remote", async () => {
    const bare = await createBareRemote(git);
    await execGit(git.path, ["-C", dir, "remote", "add", "origin", bare]);
    // Push main
    await repo.branches.publish({ branch: "main", remote: "origin" });

    await repo.branches.create({ name: "remote-topic" });
    await repo.branches.switchTo("remote-topic");
    await commitFile(dir, git, "remote-t.txt", "rt\n", "remote topic");
    await repo.branches.publish({ branch: "remote-topic", remote: "origin" });

    let list = await repo.branches.list({ includeRemotes: true });
    expect(list.some((b) => b.name === "origin/remote-topic" || b.name === "remote-topic")).toBe(
      true,
    );

    // ahead/behind: commit locally then check track after set upstream (publish already set)
    await commitFile(dir, git, "ahead.txt", "a\n", "ahead commit");
    list = await repo.branches.list({ includeRemotes: false });
    const topic = list.find((b) => b.name === "remote-topic");
    expect(topic?.upstream).toBeTruthy();
    expect((topic?.ahead ?? 0) >= 1).toBe(true);

    await repo.branches.push({ remote: "origin", branch: "remote-topic" });

    // Second clone pulls
    const cloneDir = await tempDir("gp-clone-");
    await execGit(git.path, ["clone", bare, cloneDir]);
    await execGit(git.path, ["-C", cloneDir, "config", "user.email", "test@example.com"]);
    await execGit(git.path, ["-C", cloneDir, "config", "user.name", "Test User"]);
    const cloneRepo = await openRepository(cloneDir, git);
    await cloneRepo.branches.fetch({ remote: "origin" });
    await cloneRepo.branches.switchTo("remote-topic");
    // make remote ahead for pull test
    await commitFile(dir, git, "pull-me.txt", "p\n", "for pull");
    await repo.branches.push({ remote: "origin", branch: "remote-topic" });
    await cloneRepo.branches.pull({ remote: "origin", branch: "remote-topic" });
    const pulled = await execGit(git.path, ["-C", cloneDir, "log", "-1", "--format=%s"]);
    expect(pulled.stdout.trim()).toBe("for pull");

    // set upstream explicitly on a new branch
    await repo.branches.switchTo("main");
    await repo.branches.create({ name: "set-up" });
    await repo.branches.publish({ branch: "set-up", remote: "origin" });
    await repo.branches.setUpstream({
      branch: "set-up",
      remote: "origin",
      remoteBranch: "set-up",
    });

    await repo.branches.deleteRemote({ remote: "origin", name: "remote-topic" });
    await repo.branches.fetch({ remote: "origin" });
    list = await repo.branches.list({ includeRemotes: true });
    expect(list.some((b) => b.name === "origin/remote-topic")).toBe(false);
  });
});
