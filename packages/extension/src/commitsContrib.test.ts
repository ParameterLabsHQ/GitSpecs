/**
 * Structural checks that Commits browser (P7) is contributed and wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("commits package contributions (P7)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string; title: string }[];
      views?: Record<string, { id: string; name: string }[]>;
      menus?: {
        "view/title"?: { command: string; when: string }[];
        "view/item/context"?: { command: string; when: string }[];
      };
    };
  };

  const requiredCommands = [
    "gitspecs.commits.refresh",
    "gitspecs.commits.copySha",
    "gitspecs.commits.checkout",
    "gitspecs.commits.createBranch",
    "gitspecs.commits.openRemote",
    "gitspecs.scm.showCommits",
  ];

  it("declares commits view and commands", () => {
    const side = pkg.contributes?.views?.gitspecs ?? [];
    expect(side.some((v) => v.id === "gitspecs.commits" && v.name === "Commits")).toBe(
      true,
    );
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const id of requiredCommands) {
      expect(cmds, `missing ${id}`).toContain(id);
    }
  });

  it("activates on commits view and refresh", () => {
    expect(pkg.activationEvents).toContain("onView:gitspecs.commits");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.commits.refresh");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.scm.showCommits");
  });

  it("wires commits context menus for activity-bar and SCM tab", () => {
    const items = pkg.contributes?.menus?.["view/item/context"] ?? [];
    const cm = items.filter((m) => m.command.startsWith("gitspecs.commits."));
    expect(cm.length).toBeGreaterThanOrEqual(4);
    for (const m of cm) {
      expect(m.when).toMatch(/view == gitspecs\.commits/);
      expect(m.when).toMatch(/gitspecs\.scm\.tab == commits/);
      expect(m.when).toMatch(/viewItem == commit/);
    }
  });

  it("registers commits module in extension entrypoint with bindCommand", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerCommitCommands");
    expect(src).toContain("CommitsProvider");
    expect(src).toMatch(/modules\/commits\//);

    const commands = readFileSync(
      path.join(root, "src/modules/commits/commands.ts"),
      "utf8",
    );
    expect(commands).toContain("bindCommand");
    for (const id of [
      "gitspecs.commits.copySha",
      "gitspecs.commits.checkout",
      "gitspecs.commits.createBranch",
      "gitspecs.commits.openRemote",
      "gitspecs.commits.refresh",
    ]) {
      expect(commands).toContain(id);
    }
    // Actions go through git-core (not ad-hoc git spawn)
    expect(commands).toContain("createFromCommit");
    expect(commands).toContain("checkout");
    expect(commands).not.toMatch(/spawn\s*\(|execFile\s*\(|child_process/);
  });

  it("provider loads via history.recent and refreshes on RefreshBus", () => {
    const provider = readFileSync(
      path.join(root, "src/modules/commits/provider.ts"),
      "utf8",
    );
    expect(provider).toContain("history.recent");
    expect(provider).toContain("onDidRefresh");
    expect(provider).toContain("contextValue = \"commit\"");
    expect(provider).toContain("DEFAULT_COMMITS_LIMIT");
  });

  it("ships pure format helpers and unit tests", () => {
    const dir = path.join(root, "src/modules/commits");
    expect(existsSync(path.join(dir, "format.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "format.test.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "provider.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "commands.ts"))).toBe(true);
    const format = readFileSync(path.join(dir, "format.ts"), "utf8");
    expect(format).toContain("formatCommitTreeRow");
    expect(format).toContain("DEFAULT_COMMITS_LIMIT");
    // Open-remote URL building reuses history helper (not duplicated host parse)
    const commands = readFileSync(path.join(dir, "commands.ts"), "utf8");
    expect(commands).toContain("resolveCommitUrl");
    expect(commands).toMatch(/history\/actions/);
  });

  it("git-core exposes history.recent for P7", () => {
    const history = readFileSync(
      path.join(repoRoot, "packages/git-core/src/history.ts"),
      "utf8",
    );
    expect(history).toContain("async recent(");
    expect(history).toContain("RecentCommitsOptions");
    const index = readFileSync(
      path.join(repoRoot, "packages/git-core/src/index.ts"),
      "utf8",
    );
    expect(index).toContain("RecentCommitsOptions");
  });
});
