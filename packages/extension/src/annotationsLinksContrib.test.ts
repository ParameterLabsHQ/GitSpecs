/**
 * Structural checks for P16 annotations, terminal links, autolinks, symbol CodeLens.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("annotations & link surfaces (P16)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: {
      commands?: { command: string }[];
      configuration?: {
        properties?: Record<string, unknown>;
      };
    };
  };

  it("declares toggle changes command and settings", () => {
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    expect(cmds).toContain("gitspecs.annotations.toggleChanges");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.annotations.toggleChanges");

    const props = pkg.contributes?.configuration?.properties ?? {};
    expect(props["gitspecs.annotations.changes"]).toBeDefined();
    expect(props["gitspecs.terminalLinks"]).toBeDefined();
    expect(props["gitspecs.autolinks"]).toBeDefined();
  });

  it("wires annotation + terminal link modules in extension entrypoint", () => {
    const src = readFileSync(path.join(root, "src/extension.ts"), "utf8");
    expect(src).toContain("ChangesAnnotationController");
    expect(src).toContain("registerAnnotationCommands");
    expect(src).toContain("registerTerminalLinks");
  });

  it("ships annotations controller using git-core changes API", () => {
    const ctrl = readFileSync(
      path.join(root, "src/modules/annotations/controller.ts"),
      "utf8",
    );
    expect(ctrl).toContain("repo.changes.changedLines");
    expect(ctrl).toContain("gitspecs.annotations.changes");
    expect(ctrl).not.toMatch(/spawn\s*\(|execFile\s*\(|child_process|execGit/);
  });

  it("ships terminal link matcher + provider", () => {
    expect(existsSync(path.join(root, "src/modules/terminalLinks/match.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/modules/terminalLinks/provider.ts"))).toBe(true);
    const provider = readFileSync(
      path.join(root, "src/modules/terminalLinks/provider.ts"),
      "utf8",
    );
    expect(provider).toContain("TerminalLinkProvider");
    expect(provider).toContain("findShaLinks");
    expect(provider).toContain("findRefLinks");
  });

  it("ships pure autolink helper and wires blame/history/graph", () => {
    expect(existsSync(path.join(root, "src/modules/autolinks/format.ts"))).toBe(true);
    const blameFmt = readFileSync(path.join(root, "src/modules/blame/format.ts"), "utf8");
    expect(blameFmt).toContain("applyAutolinksMarkdown");
    const hist = readFileSync(path.join(root, "src/modules/history/actions.ts"), "utf8");
    expect(hist).toContain("findAutolinks");
    const graph = readFileSync(path.join(root, "src/modules/graph/format.ts"), "utf8");
    expect(graph).toContain("appendAutolinkDetails");
  });

  it("extends CodeLens with symbol-level pure builders", () => {
    const build = readFileSync(
      path.join(root, "src/modules/blame/codeLensBuild.ts"),
      "utf8",
    );
    expect(build).toContain("buildSymbolCodeLensSpecs");
    expect(build).toContain("topLevelSymbolRanges");
    const provider = readFileSync(path.join(root, "src/modules/blame/codeLens.ts"), "utf8");
    expect(provider).toContain("executeDocumentSymbolProvider");
    expect(provider).toContain("buildSymbolCodeLensSpecs");
  });

  it("git-core exports changes API used by annotations", () => {
    expect(existsSync(path.join(repoRoot, "packages/git-core/src/changes.ts"))).toBe(true);
    const idx = readFileSync(path.join(repoRoot, "packages/git-core/src/index.ts"), "utf8");
    expect(idx).toContain("ChangesApi");
    expect(idx).toContain("parseUnifiedDiffHunks");
  });
});
