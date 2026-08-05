/**
 * Structural checks for True Clone (P24a–e) chrome, defaults, keybindings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("True Clone package contributions (P24)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents: string[];
    contributes: {
      viewsContainers: { activitybar: Array<{ id: string; title: string }> };
      views: Record<string, Array<{ id: string; name: string }>>;
      commands: Array<{ command: string }>;
      keybindings?: Array<{ command: string; key: string }>;
      configuration: {
        properties: Record<string, { type?: string; default?: unknown }>;
      };
    };
  };

  it("contributes Home, Inspect, and Graph activity-bar containers", () => {
    const ids = pkg.contributes.viewsContainers.activitybar.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(["gitspecs.home", "gitspecs.inspect", "gitspecs.graph"]),
    );
    expect(ids).not.toContain("gitspecs"); // no single mega container
  });

  it("places Hub under Home and history under Inspect; graph under Graph", () => {
    const home = pkg.contributes.views["gitspecs.home"]?.map((v) => v.id) ?? [];
    const inspect = pkg.contributes.views["gitspecs.inspect"]?.map((v) => v.id) ?? [];
    const graph = pkg.contributes.views["gitspecs.graph"]?.map((v) => v.id) ?? [];
    expect(home).toContain("gitspecs.hub");
    expect(inspect).toEqual(
      expect.arrayContaining(["gitspecs.fileHistory", "gitspecs.lineHistory"]),
    );
    expect(graph).toContain("gitspecs.graph");
  });

  it("keeps SCM as home for object browsers (grouped + individual)", () => {
    const scm = pkg.contributes.views.scm?.map((v) => v.id) ?? [];
    expect(scm).toContain("gitspecs.scm");
    expect(scm).toEqual(
      expect.arrayContaining([
        "gitspecs.worktrees",
        "gitspecs.branches",
        "gitspecs.commits",
        "gitspecs.stashes",
      ]),
    );
  });

  it("contributes Alt+B and Shift+Alt+B keybindings on gitspecs commands", () => {
    const kbs = pkg.contributes.keybindings ?? [];
    const byCmd = Object.fromEntries(kbs.map((k) => [k.command, k.key]));
    expect(byCmd["gitspecs.blame.toggleFile"]?.toLowerCase()).toBe("alt+b");
    expect(byCmd["gitspecs.blame.toggleCodeLens"]?.toLowerCase()).toBe("shift+alt+b");
  });

  it("defaults current-line, status bar, CodeLens, and hovers on", () => {
    const props = pkg.contributes.configuration.properties;
    expect(props["gitspecs.currentLine.enabled"]?.default).toBe(true);
    expect(props["gitspecs.blame.statusBar"]?.default).toBe(true);
    expect(props["gitspecs.blame.codeLens"]?.default).toBe(true);
    expect(props["gitspecs.hovers.enabled"]?.default).toBe(true);
    expect(props["gitspecs.hovers.currentLine.details"]?.default).toBe(true);
    expect(props["gitspecs.hovers.currentLine.changes"]?.default).toBe(true);
  });

  it("registers mode and dismiss commands", () => {
    const cmds = pkg.contributes.commands.map((c) => c.command);
    expect(cmds).toContain("gitspecs.mode.switch");
    expect(cmds).toContain("gitspecs.mode.toggleZen");
    expect(cmds).toContain("gitspecs.mode.toggleReview");
    expect(cmds).toContain("gitspecs.annotations.dismiss");
    expect(cmds).toContain("gitspecs.blame.toggleCodeLens");
  });

  it("wires providers and modes in extension entrypoint", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain('registerTreeDataProvider("gitspecs.fileHistory"');
    expect(src).toContain('registerTreeDataProvider("gitspecs.lineHistory"');
    expect(src).toContain("ModeController");
    expect(src).toContain("registerModeCommands");
    expect(src).toContain("FileHistoryProvider");
  });

  it("ships hover markdown and modes pure helpers", () => {
    expect(existsSync(path.join(root, "src/modules/blame/hoverMarkdown.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/shell/modes.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/modules/history/fileHistoryProvider.ts"))).toBe(
      true,
    );
    expect(existsSync(path.join(root, "src/modules/history/lineHistoryProvider.ts"))).toBe(
      true,
    );
  });

  it("docs treat True Clone / P24 as active program", () => {
    const design = readFileSync(
      path.join(repoRoot, "docs/superpowers/specs/2026-08-05-true-clone-fidelity-design.md"),
      "utf8",
    );
    expect(design).toMatch(/Status:\*\*\s*adopted|\*\*Status:\*\*\s*adopted/i);
    const roadmap = readFileSync(path.join(repoRoot, "docs/ROADMAP.md"), "utf8");
    expect(roadmap).toMatch(/P24|True Clone/i);
    const agents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
    expect(agents).toMatch(/P24|True Clone/i);
    expect(existsSync(path.join(repoRoot, "docs/FIDELITY_MATRIX.md"))).toBe(true);
  });
});
