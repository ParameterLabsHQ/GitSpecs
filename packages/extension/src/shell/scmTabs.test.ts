import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCM_TAB,
  HAS_REPOSITORY_CONTEXT_KEY,
  SCM_CONSOLIDATED_VIEW_ID,
  SCM_TAB_CONTEXT_KEY,
  ScmTabState,
  isScmTab,
  resolveScmTab,
  type ScmTab,
} from "./scmTabs.js";

describe("scmTabs pure helpers", () => {
  it("exports consolidated view id and context key used by the manifest", () => {
    expect(SCM_CONSOLIDATED_VIEW_ID).toBe("gitspecs.scm");
    expect(SCM_TAB_CONTEXT_KEY).toBe("gitspecs.scm.tab");
    expect(HAS_REPOSITORY_CONTEXT_KEY).toBe("gitspecs.hasRepository");
    expect(DEFAULT_SCM_TAB).toBe("worktrees");
  });

  it("isScmTab accepts worktrees, branches, commits, and stashes", () => {
    expect(isScmTab("worktrees")).toBe(true);
    expect(isScmTab("branches")).toBe(true);
    expect(isScmTab("commits")).toBe(true);
    expect(isScmTab("stashes")).toBe(true);
    expect(isScmTab("tags")).toBe(false);
    expect(isScmTab("")).toBe(false);
  });

  it("resolveScmTab falls back to default for unknown values", () => {
    expect(resolveScmTab("worktrees")).toBe("worktrees");
    expect(resolveScmTab("branches")).toBe("branches");
    expect(resolveScmTab("commits")).toBe("commits");
    expect(resolveScmTab("stashes")).toBe("stashes");
    expect(resolveScmTab(undefined)).toBe(DEFAULT_SCM_TAB);
    expect(resolveScmTab("nope")).toBe(DEFAULT_SCM_TAB);
  });

  it("ScmTabState starts on worktrees and reports changes", () => {
    const state = new ScmTabState();
    expect(state.active).toBe("worktrees");

    const seen: ScmTab[] = [];
    const unsub = state.onDidChange((tab) => seen.push(tab));

    expect(state.setActive("worktrees")).toBe(false);
    expect(seen).toEqual([]);

    expect(state.setActive("branches")).toBe(true);
    expect(state.active).toBe("branches");
    expect(seen).toEqual(["branches"]);

    expect(state.setActive("commits")).toBe(true);
    expect(state.active).toBe("commits");
    expect(seen).toEqual(["branches", "commits"]);

    expect(state.setActive("worktrees")).toBe(true);
    expect(state.active).toBe("worktrees");
    expect(seen).toEqual(["branches", "commits", "worktrees"]);

    unsub();
    state.setActive("branches");
    expect(seen).toEqual(["branches", "commits", "worktrees"]);
  });

  it("tab selection maps to content kind for the facade", () => {
    // Mirrors how ScmGroupedProvider chooses which provider to query.
    const contentKind = (tab: ScmTab): ScmTab => tab;
    const state = new ScmTabState();
    expect(contentKind(state.active)).toBe("worktrees");
    state.setActive("branches");
    expect(contentKind(state.active)).toBe("branches");
    state.setActive("commits");
    expect(contentKind(state.active)).toBe("commits");
  });
});
