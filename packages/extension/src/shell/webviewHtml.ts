/**
 * Pure webview HTML/CSP helpers (no vscode import) — unit-tested without the host.
 */
import { randomBytes } from "node:crypto";

export interface RenderHtmlOptions {
  cspSource: string;
  nonce: string;
  scriptSrc: string;
  title: string;
  extraCsp?: string;
  bodyHtml?: string;
}

/**
 * Generate webview HTML with CSP nonce and theme CSS variables.
 */
export function renderWebviewHtml(options: RenderHtmlOptions): string {
  const cspSource = options.cspSource;
  const nonce = options.nonce;
  const extra = options.extraCsp ? ` ${options.extraCsp}` : "";
  const csp =
    [
      `default-src 'none'`,
      `img-src ${cspSource} https: data:`,
      `style-src ${cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ") + extra;

  const body = options.bodyHtml ?? `<div id="app" class="gitspecs-webview"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    #app { height: 100%; box-sizing: border-box; }
    button, input, select {
      font: inherit;
      color: inherit;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 10px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    input[type="search"], input[type="text"] {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 4px 8px;
    }
  </style>
</head>
<body>
  ${body}
  <script nonce="${escapeAttr(nonce)}" src="${escapeAttr(options.scriptSrc)}"></script>
</body>
</html>`;
}

export function createNonce(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** Path helper: dist/webviews relative to extension package. */
export function webviewDistRelative(scriptName: string): string {
  return `dist/webviews/${scriptName}.js`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape for double-quoted HTML attributes (leave single quotes intact for CSP). */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
