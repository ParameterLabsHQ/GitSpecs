import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SCM_TAB,
  HAS_REPOSITORY_CONTEXT_KEY,
  SCM_CONSOLIDATED_VIEW_ID,
  SCM_TAB_CONTEXT_KEY,
} from "./shell/scmTabs.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("SCM Source Control contributions (GitLens-style single panel + tabs)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents: string[];
    contributes: {
      commands: Array<{ command: string; icon?: string }>;
      views: Record<string, Array<{ id: string; name: string; visibility?: string }>>;
      viewsWelcome?: Array<{ view: string; contents: string; when?: string }>;
      menus: {
        "view/title": Array<{ when: string; command: string; group?: string }>;
        "view/item/context": Array<{ when: string; command: string }>;
      };
    };
  };

  it("contributes primary consolidated GitSpecs panel under scm (not dual accordion)", () => {
    const scm = pkg.contributes.views.scm;
    expect(scm).toBeDefined();
    const ids = scm.map((v) => v.id);
    expect(ids).toContain(SCM_CONSOLIDATED_VIEW_ID);
    expect(scm.find((v) => v.id === SCM_CONSOLIDATED_VIEW_ID)?.name).toBe("GitSpecs");
    // Dual accordion ids must not return as the default SCM layout.
    expect(ids).not.toContain("gitspecs.scm.worktrees");
    expect(ids).not.toContain("gitspecs.scm.branches");
    expect(ids).not.toContain("gitspecs.scm.commits");
  });

  it("places Worktrees/Branches/Commits/Stashes under SCM (True Clone object browsers)", () => {
    const scm = pkg.contributes.views.scm;
    expect(scm.map((v) => v.id)).toEqual(
      expect.arrayContaining([
        "gitspecs.worktrees",
        "gitspecs.branches",
        "gitspecs.commits",
        "gitspecs.stashes",
      ]),
    );
  });

  it("activates on the consolidated SCM view and tab-switch commands", () => {
    expect(pkg.activationEvents).toContain(`onView:${SCM_CONSOLIDATED_VIEW_ID}`);
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showWorktrees");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showBranches");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showCommits");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showStashes");
    expect(pkg.activationEvents).toContain("onView:gitspecs.commits");
    expect(pkg.activationEvents).toContain("onView:gitspecs.stashes");
    expect(pkg.activationEvents).not.toContain("onView:gitspecs.scm.worktrees");
    expect(pkg.activationEvents).not.toContain("onView:gitspecs.scm.branches");
  });

  it("contributes Worktrees/Branches/Commits/Stashes tab-switch commands with icons", () => {
    const cmds = pkg.contributes.commands;
    const showWt = cmds.find((c) => c.command === "gitspecs.scm.showWorktrees");
    const showBr = cmds.find((c) => c.command === "gitspecs.scm.showBranches");
    const showCm = cmds.find((c) => c.command === "gitspecs.scm.showCommits");
    const showSt = cmds.find((c) => c.command === "gitspecs.scm.showStashes");
    expect(showWt).toBeDefined();
    expect(showBr).toBeDefined();
    expect(showCm).toBeDefined();
    expect(showSt).toBeDefined();
    expect(showWt?.icon).toBeTruthy();
    expect(showBr?.icon).toBeTruthy();
    expect(showCm?.icon).toBeTruthy();
    expect(showSt?.icon).toBeTruthy();
  });

  it("wires view/title navigation tabs limited to the consolidated SCM view", () => {
    const title = pkg.contributes.menus["view/title"];
    const tabMenus = title.filter(
      (m) =>
        m.command === "gitspecs.scm.showWorktrees" ||
        m.command === "gitspecs.scm.showBranches" ||
        m.command === "gitspecs.scm.showCommits" ||
        m.command === "gitspecs.scm.showStashes",
    );
    expect(tabMenus).toHaveLength(4);
    for (const m of tabMenus) {
      expect(m.when).toBe(`view == ${SCM_CONSOLIDATED_VIEW_ID}`);
      expect(m.group?.startsWith("navigation")).toBe(true);
    }
  });

  it("wires title create/refresh actions for active tab + activity-bar views", () => {
    const title = pkg.contributes.menus["view/title"];
    const wtCreate = title.find((m) => m.command === "gitspecs.worktrees.create");
    const brCreate = title.find((m) => m.command === "gitspecs.branches.create");
    const cmRefresh = title.find((m) => m.command === "gitspecs.commits.refresh");
    expect(wtCreate?.when).toContain("gitspecs.worktrees");
    expect(wtCreate?.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
    expect(wtCreate?.when).toContain(`${SCM_TAB_CONTEXT_KEY} == worktrees`);
    expect(brCreate?.when).toContain("gitspecs.branches");
    expect(brCreate?.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
    expect(brCreate?.when).toContain(`${SCM_TAB_CONTEXT_KEY} == branches`);
    expect(cmRefresh?.when).toContain("gitspecs.commits");
    expect(cmRefresh?.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
    expect(cmRefresh?.when).toContain(`${SCM_TAB_CONTEXT_KEY} == commits`);
  });

  it("wires item context menus for consolidated view with tab-aware when clauses", () => {
    const items = pkg.contributes.menus["view/item/context"];
    const wtMenus = items.filter((m) => m.command.startsWith("gitspecs.worktrees."));
    const brMenus = items.filter((m) => m.command.startsWith("gitspecs.branches."));
    const cmMenus = items.filter((m) => m.command.startsWith("gitspecs.commits."));
    expect(wtMenus.length).toBeGreaterThan(0);
    expect(brMenus.length).toBeGreaterThan(0);
    expect(cmMenus.length).toBeGreaterThan(0);
    for (const m of wtMenus) {
      expect(m.when).toContain("gitspecs.worktrees");
      expect(m.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
      expect(m.when).toContain(`${SCM_TAB_CONTEXT_KEY} == worktrees`);
      expect(m.when).not.toContain("gitspecs.scm.worktrees");
    }
    for (const m of brMenus) {
      expect(m.when).toContain("gitspecs.branches");
      expect(m.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
      expect(m.when).toContain(`${SCM_TAB_CONTEXT_KEY} == branches`);
      expect(m.when).not.toContain("gitspecs.scm.branches");
    }
    for (const m of cmMenus) {
      expect(m.when).toContain("gitspecs.commits");
      expect(m.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
      expect(m.when).toContain(`${SCM_TAB_CONTEXT_KEY} == commits`);
      expect(m.when).toContain("viewItem == commit");
    }
  });

  it("contributes viewsWelcome on the consolidated SCM view", () => {
    const welcome = pkg.contributes.viewsWelcome ?? [];
    expect(welcome.some((w) => w.view === SCM_CONSOLIDATED_VIEW_ID)).toBe(true);
    expect(welcome.every((w) => w.view !== "gitspecs.scm.worktrees")).toBe(true);
    expect(welcome.every((w) => w.view !== "gitspecs.scm.branches")).toBe(true);
  });

  it("SCM welcomes distinguish no-repo vs empty tab (stashes must not say no repo)", () => {
    const welcome = (pkg.contributes.viewsWelcome ?? []).filter(
      (w) => w.view === SCM_CONSOLIDATED_VIEW_ID,
    );
    expect(welcome.length).toBeGreaterThanOrEqual(5);

    const noRepo = welcome.find((w) => w.when === `!${HAS_REPOSITORY_CONTEXT_KEY}`);
    expect(noRepo).toBeDefined();
    expect(noRepo?.contents).toContain("No Git repository open");
    expect(noRepo?.contents).toContain("vscode.openFolder");

    for (const tab of ["worktrees", "branches", "commits", "stashes"] as const) {
      const tabWelcome = welcome.find(
        (w) =>
          w.when ===
          `${HAS_REPOSITORY_CONTEXT_KEY} && ${SCM_TAB_CONTEXT_KEY} == ${tab}`,
      );
      expect(tabWelcome, `missing SCM welcome for tab ${tab}`).toBeDefined();
      expect(tabWelcome?.contents).not.toContain("No Git repository open");
    }

    const stashes = welcome.find(
      (w) =>
        w.when ===
        `${HAS_REPOSITORY_CONTEXT_KEY} && ${SCM_TAB_CONTEXT_KEY} == stashes`,
    );
    expect(stashes?.contents).toMatch(/No stashes/i);
    expect(stashes?.contents).toContain("gitspecs.stashes.push");
    expect(stashes?.contents).toContain("gitspecs.stashes.refresh");
  });

  it("contributes viewsWelcome and visibility on activity-bar views", () => {
    const welcome = pkg.contributes.viewsWelcome ?? [];
    const activityIds = [
      "gitspecs.worktrees",
      "gitspecs.branches",
      "gitspecs.commits",
      "gitspecs.stashes",
      "gitspecs.tags",
      "gitspecs.remotes",
      "gitspecs.contributors",
      "gitspecs.graph",
      "gitspecs.hub",
    ];
    for (const id of activityIds) {
      expect(welcome.some((w) => w.view === id)).toBe(true);
    }
    // Primary activity containers remain visible; SCM object browsers may be collapsed.
    const home = pkg.contributes.views["gitspecs.home"] ?? [];
    const inspect = pkg.contributes.views["gitspecs.inspect"] ?? [];
    const graph = pkg.contributes.views["gitspecs.graph"] ?? [];
    for (const v of [...home, ...graph]) {
      expect(v.visibility ?? "visible").toBe("visible");
    }
    expect(inspect.some((v) => v.id === "gitspecs.fileHistory")).toBe(true);
    // Empty-state welcome should offer a way to recover dragged-out views.
    const worktreesWelcome = welcome.find((w) => w.view === "gitspecs.worktrees");
    expect(worktreesWelcome?.contents).toContain("workbench.action.resetViewLocations");
  });

  it("registers consolidated facade provider and tab commands in shipped extension entry", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("ScmGroupedProvider");
    expect(src).toContain("ScmTabState");
    expect(src).toContain("SCM_CONSOLIDATED_VIEW_ID");
    expect(src).toContain("registerTreeDataProvider(SCM_CONSOLIDATED_VIEW_ID");
    expect(src).toContain("gitspecs.scm.showWorktrees");
    expect(src).toContain("gitspecs.scm.showBranches");
    expect(src).toContain("gitspecs.scm.showCommits");
    expect(src).toContain("gitspecs.scm.showStashes");
    expect(src).toContain("setContext");
    expect(src).toContain("SCM_TAB_CONTEXT_KEY");
    expect(src).toContain("HAS_REPOSITORY_CONTEXT_KEY");
    // Dual SCM accordion providers must not be registered.
    expect(src).not.toContain('registerTreeDataProvider("gitspecs.scm.worktrees"');
    expect(src).not.toContain('registerTreeDataProvider("gitspecs.scm.branches"');
    // Activity-bar views remain (including commits/stashes).
    expect(src).toContain('registerTreeDataProvider("gitspecs.worktrees"');
    expect(src).toContain('registerTreeDataProvider("gitspecs.branches"');
    expect(src).toContain('registerTreeDataProvider("gitspecs.commits"');
    expect(src).toContain('registerTreeDataProvider("gitspecs.stashes"');
    expect(src).toContain("CommitsProvider");
    expect(src).toContain("registerCommitCommands");
    expect(src).toContain("StashesProvider");
    expect(src).toContain("registerStashCommands");
  });

  it("default tab constant matches worktrees content kind", () => {
    expect(DEFAULT_SCM_TAB).toBe("worktrees");
  });
});
