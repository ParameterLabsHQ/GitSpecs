/**
 * Structural checks that compare & search (P6) are contributed and wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("compare & search package contributions (P6)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string; title: string }[];
    };
  };

  it("declares compare and search commands", () => {
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    expect(cmds).toContain("gitspecs.compare");
    expect(cmds).toContain("gitspecs.search.commits");
    expect(cmds).toContain("gitspecs.branches.compare");
  });

  it("activates on compare and search commands", () => {
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.compare");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.search.commits");
  });

  it("registers compare/search in extension entrypoint", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerCompareCommands");
    expect(src).toContain("registerSearchCommands");
    expect(src).toMatch(/modules\/compare\/commands/);
    expect(src).toMatch(/modules\/search\/commands/);
  });

  it("compare module ships commands + pure format helpers", () => {
    const dir = path.join(root, "src/modules/compare");
    expect(existsSync(path.join(dir, "commands.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "format.ts"))).toBe(true);
    const commands = readFileSync(path.join(dir, "commands.ts"), "utf8");
    expect(commands).toContain("gitspecs.compare");
    expect(commands).toContain("runCompareInteractive");
    expect(commands).toContain("bindCommand");
    expect(commands).toContain("repo.branches.compare");
    const format = readFileSync(path.join(dir, "format.ts"), "utf8");
    expect(format).toContain("@gitspecs/host-urls");
    expect(format).toContain("compareUrl");
    expect(format).toContain("buildComparePickItems");
  });

  it("search module ships commands + pure format helpers", () => {
    const dir = path.join(root, "src/modules/search");
    expect(existsSync(path.join(dir, "commands.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "format.ts"))).toBe(true);
    const commands = readFileSync(path.join(dir, "commands.ts"), "utf8");
    expect(commands).toContain("gitspecs.search.commits");
    expect(commands).toContain("bindCommand");
    expect(commands).toContain("repo.history.search");
    const format = readFileSync(path.join(dir, "format.ts"), "utf8");
    expect(format).toContain("searchCommitActions");
    expect(format).toContain("normalizeSearchQuery");
  });

  it("branches.compare uses shared rich compare flow (not message-only)", () => {
    const branches = readFileSync(
      path.join(root, "src/modules/branches/commands.ts"),
      "utf8",
    );
    expect(branches).toContain("runCompareInteractive");
    expect(branches).toContain("gitspecs.branches.compare");
  });

  it("does not spawn git ad hoc in compare/search modules", () => {
    for (const mod of ["compare", "search"] as const) {
      const dir = path.join(root, "src/modules", mod);
      const commands = readFileSync(path.join(dir, "commands.ts"), "utf8");
      expect(commands).not.toMatch(/spawn\s*\(|execFile\s*\(|child_process/);
      expect(commands).not.toMatch(/execGit/);
    }
  });
});
