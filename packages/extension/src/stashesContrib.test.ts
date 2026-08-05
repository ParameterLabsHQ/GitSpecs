/**
 * Structural checks that Stashes browser (P8) is contributed and wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("stashes package contributions (P8)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string }[];
      views?: Record<string, { id: string; name: string }[]>;
      menus?: {
        "view/title"?: { command: string; when: string }[];
        "view/item/context"?: { command: string; when: string }[];
      };
    };
  };

  const required = [
    "gitspecs.stashes.refresh",
    "gitspecs.stashes.push",
    "gitspecs.stashes.apply",
    "gitspecs.stashes.pop",
    "gitspecs.stashes.drop",
    "gitspecs.stashes.show",
    "gitspecs.scm.showStashes",
  ];

  it("declares stashes view and commands", () => {
    const allViews = Object.values(pkg.contributes?.views ?? {}).flat();
    expect(allViews.some((v) => v.id === "gitspecs.stashes" && v.name === "Stashes")).toBe(true);
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const id of required) {
      expect(cmds, `missing ${id}`).toContain(id);
    }
  });

  it("activates on stashes view and commands", () => {
    expect(pkg.activationEvents).toContain("onView:gitspecs.stashes");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.stashes.refresh");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showStashes");
  });

  it("wires context menus for activity-bar and SCM tab", () => {
    const items = pkg.contributes?.menus?.["view/item/context"] ?? [];
    const sm = items.filter((m) => m.command.startsWith("gitspecs.stashes."));
    expect(sm.length).toBeGreaterThanOrEqual(4);
    for (const m of sm) {
      expect(m.when).toMatch(/view == gitspecs\.stashes/);
      expect(m.when).toMatch(/gitspecs\.scm\.tab == stashes/);
      expect(m.when).toMatch(/viewItem == stash/);
    }
  });

  it("registers stashes in extension entry with bindCommand", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerStashCommands");
    expect(src).toContain("StashesProvider");
    expect(src).toContain('registerTreeDataProvider("gitspecs.stashes"');
    expect(src).toContain("gitspecs.scm.showStashes");

    const commands = readFileSync(
      path.join(root, "src/modules/stashes/commands.ts"),
      "utf8",
    );
    expect(commands).toContain("bindCommand");
    expect(commands).toContain("confirmDelete");
    expect(commands).not.toMatch(/spawn\s*\(|execFile\s*\(|child_process/);
    for (const id of [
      "gitspecs.stashes.push",
      "gitspecs.stashes.apply",
      "gitspecs.stashes.pop",
      "gitspecs.stashes.drop",
      "gitspecs.stashes.show",
    ]) {
      expect(commands).toContain(id);
    }
  });

  it("provider lists via stashes.list and RefreshBus", () => {
    const provider = readFileSync(
      path.join(root, "src/modules/stashes/provider.ts"),
      "utf8",
    );
    expect(provider).toContain("stashes.list");
    expect(provider).toContain("onDidRefresh");
    expect(provider).toContain('contextValue = "stash"');
  });

  it("SCM stashes empty welcome does not claim no repository is open", () => {
    const welcome = (
      (
        pkg.contributes as {
          viewsWelcome?: Array<{ view: string; contents: string; when?: string }>;
        }
      )?.viewsWelcome ?? []
    ).filter((w) => w.view === "gitspecs.scm" && w.when?.includes("stashes"));
    expect(welcome.length).toBe(1);
    expect(welcome[0]?.when).toContain("gitspecs.hasRepository");
    expect(welcome[0]?.contents).toMatch(/No stashes/i);
    expect(welcome[0]?.contents).not.toMatch(/No Git repository open/i);
  });

  it("ships format helpers and unit tests", () => {
    const dir = path.join(root, "src/modules/stashes");
    expect(existsSync(path.join(dir, "format.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "format.test.ts"))).toBe(true);
  });

  it("git-core exposes stashes API", () => {
    const stashes = readFileSync(
      path.join(repoRoot, "packages/git-core/src/stashes.ts"),
      "utf8",
    );
    expect(stashes).toContain("class StashesApi");
    expect(stashes).toContain("async list(");
    expect(stashes).toContain("async push(");
    expect(stashes).toContain("async apply(");
    expect(stashes).toContain("async pop(");
    expect(stashes).toContain("async drop(");
    expect(stashes).toContain("async show(");
    const repo = readFileSync(
      path.join(repoRoot, "packages/git-core/src/repository.ts"),
      "utf8",
    );
    expect(repo).toContain("stashes");
  });
});
