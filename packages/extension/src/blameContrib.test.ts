import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("blame extension contributions", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents: string[];
    contributes: {
      commands: Array<{ command: string }>;
      menus: Record<string, Array<{ command: string }>>;
      configuration: {
        properties: Record<string, { type?: string; default?: unknown }>;
      };
    };
  };

  it("registers blame commands in the manifest", () => {
    const cmds = pkg.contributes.commands.map((c) => c.command);
    expect(cmds).toContain("gitspecs.blame.toggleFile");
    expect(cmds).toContain("gitspecs.blame.showLine");
    expect(cmds).toContain("gitspecs.blame.fileToOutput");
    expect(cmds).toContain("gitspecs.blame.statusBarDetails");
    expect(cmds).toContain("gitspecs.blame.codeLensDetail");
  });

  it("activates on startup and blame commands (status bar / CodeLens need early activate)", () => {
    expect(pkg.activationEvents).toContain("onStartupFinished");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.blame.toggleFile");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.blame.showLine");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.blame.statusBarDetails");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.blame.codeLensDetail");
  });

  it("wires blame into editor context menus", () => {
    const editorCtx = pkg.contributes.menus["editor/context"] ?? [];
    const commands = editorCtx.map((m) => m.command);
    expect(commands).toContain("gitspecs.blame.showLine");
    expect(commands).toContain("gitspecs.blame.toggleFile");
  });

  it("declares status-bar and CodeLens settings", () => {
    const props = pkg.contributes.configuration.properties;
    expect(props["gitspecs.blame.statusBar"]).toBeDefined();
    expect(props["gitspecs.blame.statusBar"]!.type).toBe("boolean");
    expect(props["gitspecs.blame.statusBar"]!.default).toBe(true);
    expect(props["gitspecs.blame.codeLens"]).toBeDefined();
    expect(props["gitspecs.blame.codeLens"]!.type).toBe("boolean");
    expect(props["gitspecs.blame.codeLens"]!.default).toBe(true);
  });

  it("registers blame in extension activate source", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("registerBlameCommands");
    expect(src).toContain("BlameController");
    expect(src).toContain("BlameCodeLensProvider");
    expect(src).toContain("registerCodeLensProvider");
  });

  it("ships status-bar and CodeLens module sources", () => {
    const blameDir = path.join(root, "src/modules/blame");
    expect(existsSync(path.join(blameDir, "controller.ts"))).toBe(true);
    expect(existsSync(path.join(blameDir, "codeLens.ts"))).toBe(true);
    expect(existsSync(path.join(blameDir, "detail.ts"))).toBe(true);
    expect(existsSync(path.join(blameDir, "cache.ts"))).toBe(true);
    expect(existsSync(path.join(blameDir, "format.ts"))).toBe(true);

    const controller = readFileSync(path.join(blameDir, "controller.ts"), "utf8");
    expect(controller).toContain("createStatusBarItem");
    expect(controller).toContain("onDidChangeTextEditorSelection");
    expect(controller).toContain("gitspecs.blame.statusBarDetails");
    expect(controller).toContain("blame.statusBar");

    const codeLens = readFileSync(path.join(blameDir, "codeLens.ts"), "utf8");
    expect(codeLens).toContain("provideCodeLenses");
    expect(codeLens).toContain("blame.codeLens");
    expect(codeLens).toContain("gitspecs.blame.codeLensDetail");
    expect(codeLens).toContain("shouldAcceptCodeLensResult");
    expect(codeLens).toContain("buildFileCodeLensSpecs");
    // Must not use a provider-global sequence that races concurrent documents
    expect(codeLens).not.toMatch(/this\.seq\s*=/);
    expect(codeLens).not.toMatch(/mySeq\s*!==\s*this\.seq/);
    expect(existsSync(path.join(blameDir, "codeLensBuild.ts"))).toBe(true);

    const commands = readFileSync(path.join(blameDir, "commands.ts"), "utf8");
    expect(commands).toContain("gitspecs.blame.statusBarDetails");
    expect(commands).toContain("gitspecs.blame.codeLensDetail");
  });
});
