import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SCM_TAB,
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
      viewsWelcome?: Array<{ view: string; contents: string }>;
      menus: {
        "view/title": Array<{ when: string; command: string; group?: string }>;
        "view/item/context": Array<{ when: string; command: string }>;
      };
    };
  };

  it("contributes exactly one primary GitSpecs panel under scm (not dual accordion)", () => {
    const scm = pkg.contributes.views.scm;
    expect(scm).toBeDefined();
    const ids = scm.map((v) => v.id);
    expect(ids).toEqual([SCM_CONSOLIDATED_VIEW_ID]);
    expect(scm[0]?.name).toBe("GitSpecs");
    // Dual accordion ids must not return as the default SCM layout.
    expect(ids).not.toContain("gitspecs.scm.worktrees");
    expect(ids).not.toContain("gitspecs.scm.branches");
    expect(scm).toHaveLength(1);
  });

  it("keeps dedicated activity-bar Worktrees and Branches views", () => {
    const side = pkg.contributes.views.gitspecs;
    expect(side.map((v) => v.id)).toEqual(
      expect.arrayContaining(["gitspecs.worktrees", "gitspecs.branches"]),
    );
  });

  it("activates on the consolidated SCM view and tab-switch commands", () => {
    expect(pkg.activationEvents).toContain(`onView:${SCM_CONSOLIDATED_VIEW_ID}`);
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showWorktrees");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showBranches");
    expect(pkg.activationEvents).not.toContain("onView:gitspecs.scm.worktrees");
    expect(pkg.activationEvents).not.toContain("onView:gitspecs.scm.branches");
  });

  it("contributes Worktrees/Branches tab-switch commands with icons", () => {
    const cmds = pkg.contributes.commands;
    const showWt = cmds.find((c) => c.command === "gitspecs.scm.showWorktrees");
    const showBr = cmds.find((c) => c.command === "gitspecs.scm.showBranches");
    expect(showWt).toBeDefined();
    expect(showBr).toBeDefined();
    expect(showWt?.icon).toBeTruthy();
    expect(showBr?.icon).toBeTruthy();
  });

  it("wires view/title navigation tabs limited to the consolidated SCM view", () => {
    const title = pkg.contributes.menus["view/title"];
    const tabMenus = title.filter(
      (m) =>
        m.command === "gitspecs.scm.showWorktrees" || m.command === "gitspecs.scm.showBranches",
    );
    expect(tabMenus).toHaveLength(2);
    for (const m of tabMenus) {
      expect(m.when).toBe(`view == ${SCM_CONSOLIDATED_VIEW_ID}`);
      expect(m.group?.startsWith("navigation")).toBe(true);
    }
  });

  it("wires title create/refresh actions for active tab + activity-bar views", () => {
    const title = pkg.contributes.menus["view/title"];
    const wtCreate = title.find((m) => m.command === "gitspecs.worktrees.create");
    const brCreate = title.find((m) => m.command === "gitspecs.branches.create");
    expect(wtCreate?.when).toContain("gitspecs.worktrees");
    expect(wtCreate?.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
    expect(wtCreate?.when).toContain(`${SCM_TAB_CONTEXT_KEY} == worktrees`);
    expect(brCreate?.when).toContain("gitspecs.branches");
    expect(brCreate?.when).toContain(SCM_CONSOLIDATED_VIEW_ID);
    expect(brCreate?.when).toContain(`${SCM_TAB_CONTEXT_KEY} == branches`);
  });

  it("wires item context menus for consolidated view with tab-aware when clauses", () => {
    const items = pkg.contributes.menus["view/item/context"];
    const wtMenus = items.filter((m) => m.command.startsWith("gitspecs.worktrees."));
    const brMenus = items.filter((m) => m.command.startsWith("gitspecs.branches."));
    expect(wtMenus.length).toBeGreaterThan(0);
    expect(brMenus.length).toBeGreaterThan(0);
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
  });

  it("contributes viewsWelcome on the consolidated SCM view", () => {
    const welcome = pkg.contributes.viewsWelcome ?? [];
    expect(welcome.some((w) => w.view === SCM_CONSOLIDATED_VIEW_ID)).toBe(true);
    expect(welcome.every((w) => w.view !== "gitspecs.scm.worktrees")).toBe(true);
    expect(welcome.every((w) => w.view !== "gitspecs.scm.branches")).toBe(true);
  });

  it("registers consolidated facade provider and tab commands in shipped extension entry", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("ScmGroupedProvider");
    expect(src).toContain("ScmTabState");
    expect(src).toContain("SCM_CONSOLIDATED_VIEW_ID");
    expect(src).toContain("registerTreeDataProvider(SCM_CONSOLIDATED_VIEW_ID");
    expect(src).toContain('gitspecs.scm.showWorktrees');
    expect(src).toContain('gitspecs.scm.showBranches');
    expect(src).toContain("setContext");
    expect(src).toContain("SCM_TAB_CONTEXT_KEY");
    // Dual SCM accordion providers must not be registered.
    expect(src).not.toContain('registerTreeDataProvider("gitspecs.scm.worktrees"');
    expect(src).not.toContain('registerTreeDataProvider("gitspecs.scm.branches"');
    // Activity-bar dual views remain.
    expect(src).toContain('registerTreeDataProvider("gitspecs.worktrees"');
    expect(src).toContain('registerTreeDataProvider("gitspecs.branches"');
  });

  it("default tab constant matches worktrees content kind", () => {
    expect(DEFAULT_SCM_TAB).toBe("worktrees");
  });
});
