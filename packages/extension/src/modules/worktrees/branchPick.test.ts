import { describe, it, expect } from "vitest";
import { existingWorktreeBranchNames, worktreeBranchRefFromPick } from "./branchPick.js";

describe("existingWorktreeBranchNames", () => {
  it("includes local branches with slashes and all remotes", () => {
    const names = existingWorktreeBranchNames([
      { name: "main", remote: false },
      { name: "feature/foo", remote: false },
      { name: "bugfix/bar-baz", remote: false },
      { name: "origin/main", remote: true },
      { name: "origin/feature/foo", remote: true },
      { name: "upstream/release", remote: true },
      { name: "(detached abc)", remote: false, detached: true },
    ]);

    expect(names).toContain("main");
    expect(names).toContain("feature/foo");
    expect(names).toContain("bugfix/bar-baz");
    expect(names).toContain("origin/main");
    expect(names).toContain("origin/feature/foo");
    expect(names).toContain("upstream/release");
    expect(names).not.toContain("(detached abc)");
  });

  it("does not drop feature/* the way origin-only slash filters would", () => {
    // Regression: old filter was `!n.includes('/') || n.startsWith('origin/')`
    // which excluded feature/foo.
    const names = existingWorktreeBranchNames([
      { name: "feature/foo", remote: false },
      { name: "upstream/only", remote: true },
    ]);
    expect(names).toEqual(["feature/foo", "upstream/only"]);
  });
});

describe("worktreeBranchRefFromPick", () => {
  it("preserves local slash names and remote-tracking names", () => {
    expect(worktreeBranchRefFromPick("feature/foo")).toBe("feature/foo");
    expect(worktreeBranchRefFromPick("origin/feature/foo")).toBe("origin/feature/foo");
  });
});
