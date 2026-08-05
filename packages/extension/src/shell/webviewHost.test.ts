import { describe, it, expect } from "vitest";
import {
  createNonce,
  renderWebviewHtml,
  webviewDistRelative,
} from "./webviewHtml.js";

describe("webview host HTML / CSP (P18)", () => {
  it("createNonce returns non-empty unique values", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a.length).toBeGreaterThan(8);
    expect(b).not.toBe(a);
  });

  it("renderWebviewHtml embeds nonce CSP and script tag", () => {
    const nonce = "test-nonce-abc";
    const html = renderWebviewHtml({
      cspSource: "vscode-webview:",
      nonce,
      scriptSrc: "vscode-webview://ext/dist/webviews/graph.js",
      title: "Commit Graph",
    });
    expect(html).toContain(`script-src 'nonce-${nonce}'`);
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain("vscode-webview://ext/dist/webviews/graph.js");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("--vscode-editor-background");
    expect(html).not.toContain("http://cdn");
    expect(html).toContain("Commit Graph");
  });

  it("webviewDistRelative points at dist/webviews", () => {
    expect(webviewDistRelative("graph")).toBe("dist/webviews/graph.js");
  });
});
