/**
 * Structural checks for P18 webview platform + Commit Graph canvas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("webview platform + graph canvas (P18)", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    activationEvents?: string[];
    contributes?: { commands?: { command: string }[] };
  };

  it("declares open graph view command", () => {
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    expect(cmds).toContain("gitspecs.graph.openView");
    expect(pkg.activationEvents).toContain("onCommand:gitspecs.graph.openView");
  });

  it("ships webview host + HTML CSP helpers", () => {
    expect(existsSync(path.join(root, "src/shell/webviewHost.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/shell/webviewHtml.ts"))).toBe(true);
    const host = readFileSync(path.join(root, "src/shell/webviewHost.ts"), "utf8");
    expect(host).toContain("createGitSpecsWebview");
    expect(host).toContain("renderWebviewHtml");
    const html = readFileSync(path.join(root, "src/shell/webviewHtml.ts"), "utf8");
    expect(html).toContain("script-src 'nonce-");
    expect(html).toContain("--vscode-editor-background");
  });

  it("ships graph protocol + client + host controller", () => {
    expect(existsSync(path.join(root, "src/webviews/graph/protocol.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/webviews/graph/main.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/modules/graph/graphView.ts"))).toBe(true);
    const main = readFileSync(path.join(root, "src/webviews/graph/main.ts"), "utf8");
    expect(main).toContain("acquireVsCodeApi");
    expect(main).toContain("graph:requestPage");
    const view = readFileSync(path.join(root, "src/modules/graph/graphView.ts"), "utf8");
    expect(view).toContain("createGitSpecsWebview");
    expect(view).toContain("logPage");
    expect(view).toContain("gitspecs.graphView");
  });

  it("esbuild builds a second webview target", () => {
    const esbuild = readFileSync(path.join(root, "esbuild.mjs"), "utf8");
    expect(esbuild).toContain("dist/webviews");
    expect(esbuild).toContain("webviewEntries");
    expect(esbuild).toContain("platform: \"browser\"");
  });

  it("documents WEBVIEWS.md and design note", () => {
    expect(existsSync(path.join(repoRoot, "docs/WEBVIEWS.md"))).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, "docs/superpowers/specs/2026-08-05-p18-webview-platform.md"),
      ),
    ).toBe(true);
    const docs = readFileSync(path.join(repoRoot, "docs/WEBVIEWS.md"), "utf8");
    expect(docs).toContain("webviewHost");
    expect(docs).toContain("CSP");
  });

  it("git-core exposes paged graph logPage", () => {
    const graph = readFileSync(path.join(repoRoot, "packages/git-core/src/graph.ts"), "utf8");
    expect(graph).toContain("logPage");
    expect(graph).toContain("hasMore");
    expect(graph).toContain("skip");
  });
});
