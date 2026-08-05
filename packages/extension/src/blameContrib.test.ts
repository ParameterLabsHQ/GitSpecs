import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("blame extension contributions", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents: string[];
    contributes: {
      commands: Array<{ command: string }>;
      menus: Record<string, Array<{ command: string }>>;
    };
  };

  it("registers blame commands in the manifest", () => {
    const cmds = pkg.contributes.commands.map((c) => c.command);
    expect(cmds).toContain("gitspecs.blame.toggleFile");
    expect(cmds).toContain("gitspecs.blame.showLine");
    expect(cmds).toContain("gitspecs.blame.fileToOutput");
  });

  it("activates on blame commands", () => {
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.blame.toggleFile");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.blame.showLine");
  });

  it("wires blame into editor context menus", () => {
    const editorCtx = pkg.contributes.menus["editor/context"] ?? [];
    const commands = editorCtx.map((m) => m.command);
    expect(commands).toContain("gitspecs.blame.showLine");
    expect(commands).toContain("gitspecs.blame.toggleFile");
  });

  it("registers blame in extension activate source", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerBlameCommands");
    expect(src).toContain("BlameController");
  });
});
