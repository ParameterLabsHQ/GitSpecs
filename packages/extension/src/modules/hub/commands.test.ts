import { describe, it, expect } from "vitest";
import { resolveHubRepo } from "./resolveRepo.js";
import type { RepoContext } from "../../shell/repoContext.js";
import type { GitRepository } from "@gitspecs/git-core";

function fakeRepo(root: string): GitRepository {
  return { root } as GitRepository;
}

function fakeRepos(current: GitRepository, all: GitRepository[]): RepoContext {
  return {
    currentRepo: current,
    allRepos: all,
    repoByRoot(root: string) {
      return all.find((r) => r.root === root);
    },
  } as unknown as RepoContext;
}

describe("resolveHubRepo (multi-repo)", () => {
  it("prefers item.repoRoot over currentRepo", () => {
    const a = fakeRepo("/repos/a");
    const b = fakeRepo("/repos/b");
    const repos = fakeRepos(a, [a, b]);
    expect(resolveHubRepo(repos, { repoRoot: "/repos/b" })?.root).toBe("/repos/b");
  });

  it("falls back to currentRepo when repoRoot empty", () => {
    const a = fakeRepo("/repos/a");
    const repos = fakeRepos(a, [a]);
    expect(resolveHubRepo(repos, { repoRoot: "" })?.root).toBe("/repos/a");
    expect(resolveHubRepo(repos, undefined)?.root).toBe("/repos/a");
  });
});
