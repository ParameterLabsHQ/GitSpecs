/**
 * Structural checks that history (P4/P5) is contributed and wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("history package contributions (P4/P5)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string; title: string }[];
      menus?: {
        "editor/context"?: { command: string }[];
        "editor/title"?: { command: string }[];
      };
    };
  };

  it("declares file and line history commands", () => {
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    expect(cmds).toContain("gitspecs.history.file");
    expect(cmds).toContain("gitspecs.history.line");
  });

  it("activates on history commands", () => {
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.history.file");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.history.line");
  });

  it("surfaces history in editor context menu", () => {
    const contextMenus = pkg.contributes?.menus?.["editor/context"] ?? [];
    const commands = contextMenus.map((m) => m.command);
    expect(commands).toContain("gitspecs.history.file");
    expect(commands).toContain("gitspecs.history.line");
  });

  it("registers history commands in extension entrypoint", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerHistoryCommands");
    expect(src).toMatch(/modules\/history\/commands/);
  });

  it("history module ships commands + pure actions (not README-only stub)", () => {
    const histDir = path.join(root, "src/modules/history");
    expect(existsSync(path.join(histDir, "commands.ts"))).toBe(true);
    expect(existsSync(path.join(histDir, "actions.ts"))).toBe(true);
    const commands = readFileSync(path.join(histDir, "commands.ts"), "utf8");
    expect(commands).toContain("gitspecs.history.file");
    expect(commands).toContain("gitspecs.history.line");
    expect(commands).toContain("bindCommand");
    expect(commands).toContain("repo.history");
    // Uses host-urls path via actions (copy SHA / open remote / view at rev)
    const actions = readFileSync(path.join(histDir, "actions.ts"), "utf8");
    expect(actions).toContain("@gitspecs/host-urls");
    expect(actions).toContain("commitUrl");
    expect(actions).toContain("copySha");
    expect(actions).toContain("openCommitUrl");
    expect(actions).toContain("viewAtRev");
    expect(actions).toContain("diffWithPrevious");
    expect(actions).toContain("diffWithWorking");
  });

  it("does not spawn git ad hoc in history module", () => {
    const histDir = path.join(root, "src/modules/history");
    const commands = readFileSync(path.join(histDir, "commands.ts"), "utf8");
    expect(commands).not.toMatch(/spawn\s*\(|execFile\s*\(|child_process/);
    expect(commands).not.toMatch(/execGit/);
  });
});
