import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("rewrite contributions (P12)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: { commands?: { command: string }[] };
  };

  it("declares guided rewrite commands", () => {
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const id of [
      "gitspecs.rewrite.rebase",
      "gitspecs.rewrite.cherryPick",
      "gitspecs.rewrite.abort",
      "gitspecs.rewrite.continue",
      "gitspecs.rewrite.status",
      "gitspecs.rewrite.interactiveRebase",
      "gitspecs.rewrite.editTodo",
    ]) {
      expect(cmds).toContain(id);
      expect(pkg.activationEvents).toContain(`onCommand:${id}`);
    }
  });

  it("wires module and library", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerRewriteCommands");
    const cmd = readFileSync(path.join(root, "src/modules/rewrite/commands.ts"), "utf8");
    expect(cmd).toContain("bindCommand");
    expect(cmd).toContain("guidedRebase");
    expect(cmd).toContain("formatConflictGuidance");
    expect(cmd).toContain("startInteractiveRebase");
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/rewrite.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/rebaseTodo.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/webviews/rebase/main.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/modules/rewrite/rebaseEditor.ts"))).toBe(true);
  });

  it("registers git-rebase-todo language contribution", () => {
    const pkgFull = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      contributes?: { languages?: { filenames?: string[] }[] };
    };
    const langs = pkgFull.contributes?.languages ?? [];
    expect(
      langs.some((l) => (l.filenames ?? []).includes("git-rebase-todo")),
    ).toBe(true);
  });
});
