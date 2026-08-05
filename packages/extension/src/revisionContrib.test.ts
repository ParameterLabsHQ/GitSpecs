/**
 * Structural checks that P15 revision navigation is contributed and wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REVISION_COMMANDS = [
  "gitspecs.revision.openAtRevision",
  "gitspecs.revision.diffWithPrevious",
  "gitspecs.revision.diffWithWorking",
  "gitspecs.revision.previous",
  "gitspecs.revision.next",
] as const;

describe("revision package contributions (P15)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string; title: string; icon?: string }[];
      menus?: {
        "editor/context"?: { command: string; when?: string }[];
        "editor/title"?: { command: string; when?: string }[];
      };
    };
  };

  it("declares all revision navigation commands", () => {
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const c of REVISION_COMMANDS) {
      expect(cmds, c).toContain(c);
    }
  });

  it("activates on revision commands", () => {
    for (const c of REVISION_COMMANDS) {
      expect(pkg.activationEvents).toContain(`onCommand:${c}`);
    }
  });

  it("surfaces prev/next in editor title when viewing gitspecs: documents", () => {
    const titleMenus = pkg.contributes?.menus?.["editor/title"] ?? [];
    const byCmd = Object.fromEntries(titleMenus.map((m) => [m.command, m]));
    expect(byCmd["gitspecs.revision.previous"]?.when).toMatch(/resourceScheme == gitspecs/);
    expect(byCmd["gitspecs.revision.previous"]?.when).toMatch(/hasPrevious/);
    expect(byCmd["gitspecs.revision.next"]?.when).toMatch(/resourceScheme == gitspecs/);
    expect(byCmd["gitspecs.revision.next"]?.when).toMatch(/hasNext/);
  });

  it("surfaces diff commands in editor context menu", () => {
    const contextMenus = pkg.contributes?.menus?.["editor/context"] ?? [];
    const commands = contextMenus.map((m) => m.command);
    expect(commands).toContain("gitspecs.revision.openAtRevision");
    expect(commands).toContain("gitspecs.revision.diffWithPrevious");
    expect(commands).toContain("gitspecs.revision.diffWithWorking");
  });

  it("registers revision provider + commands in extension entrypoint", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerRevisionCommands");
    expect(src).toContain("registerRevisionContentProvider");
    expect(src).toMatch(/modules\/revision\//);
  });

  it("revision module ships provider, commands, and pure URI helpers", () => {
    const revDir = path.join(root, "src/modules/revision");
    expect(existsSync(path.join(revDir, "commands.ts"))).toBe(true);
    expect(existsSync(path.join(revDir, "provider.ts"))).toBe(true);
    expect(existsSync(path.join(revDir, "uri.ts"))).toBe(true);
    expect(existsSync(path.join(revDir, "uriParts.ts"))).toBe(true);

    const provider = readFileSync(path.join(revDir, "provider.ts"), "utf8");
    expect(provider).toContain("TextDocumentContentProvider");
    expect(provider).toContain("REVISION_SCHEME");
    expect(provider).toContain("repo.history.showFile");

    const commands = readFileSync(path.join(revDir, "commands.ts"), "utf8");
    for (const c of REVISION_COMMANDS) {
      expect(commands).toContain(c);
    }
    expect(commands).toContain("bindCommand");
    expect(commands).toContain("revisionNeighbors");
    expect(commands).toContain("vscode.diff");

    // History no longer opens untitled content previews
    const hist = readFileSync(path.join(root, "src/modules/history/commands.ts"), "utf8");
    expect(hist).toContain("openRevisionInEditor");
    expect(hist).not.toMatch(/openTextDocument\(\s*\{\s*content/);
  });

  it("does not spawn git ad hoc in revision module", () => {
    const revDir = path.join(root, "src/modules/revision");
    for (const name of ["commands.ts", "provider.ts"]) {
      const src = readFileSync(path.join(revDir, name), "utf8");
      expect(src).not.toMatch(/spawn\s*\(|execFile\s*\(|child_process/);
      expect(src).not.toMatch(/execGit/);
    }
  });
});
