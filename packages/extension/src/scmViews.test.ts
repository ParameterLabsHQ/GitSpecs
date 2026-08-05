import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("SCM Source Control contributions (GitLens-style)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents: string[];
    contributes: {
      views: Record<string, Array<{ id: string; name: string }>>;
      menus: {
        "view/title": Array<{ when: string; command: string }>;
        "view/item/context": Array<{ when: string; command: string }>;
      };
    };
  };

  it("contributes Worktrees and Branches views under the scm container", () => {
    const scm = pkg.contributes.views.scm;
    expect(scm).toBeDefined();
    const ids = scm.map((v) => v.id);
    expect(ids).toContain("gitPlatform.scm.worktrees");
    expect(ids).toContain("gitPlatform.scm.branches");
    expect(scm.find((v) => v.id === "gitPlatform.scm.worktrees")?.name).toBe("Worktrees");
    expect(scm.find((v) => v.id === "gitPlatform.scm.branches")?.name).toBe("Branches");
  });

  it("keeps dedicated activity-bar views as well", () => {
    const side = pkg.contributes.views.gitPlatform;
    expect(side.map((v) => v.id)).toEqual(
      expect.arrayContaining(["gitPlatform.worktrees", "gitPlatform.branches"]),
    );
  });

  it("activates when SCM views become visible", () => {
    expect(pkg.activationEvents).toContain("onView:gitPlatform.scm.worktrees");
    expect(pkg.activationEvents).toContain("onView:gitPlatform.scm.branches");
  });

  it("wires view title and context menus for SCM view ids", () => {
    const titleWhens = pkg.contributes.menus["view/title"].map((m) => m.when);
    expect(titleWhens.some((w) => w.includes("gitPlatform.scm.worktrees"))).toBe(true);
    expect(titleWhens.some((w) => w.includes("gitPlatform.scm.branches"))).toBe(true);

    const itemWhens = pkg.contributes.menus["view/item/context"].map((m) => m.when);
    expect(itemWhens.every((w) => w.includes("gitPlatform.scm.") || w.includes("gitPlatform.worktrees") || w.includes("gitPlatform.branches"))).toBe(true);
    expect(itemWhens.some((w) => w.includes("scm.worktrees"))).toBe(true);
    expect(itemWhens.some((w) => w.includes("scm.branches"))).toBe(true);
  });

  it("registers SCM providers in the shipped extension entry source", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain('registerTreeDataProvider("gitPlatform.scm.worktrees"');
    expect(src).toContain('registerTreeDataProvider("gitPlatform.scm.branches"');
  });
});
