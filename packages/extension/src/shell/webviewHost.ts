import * as vscode from "vscode";
import { createNonce, renderWebviewHtml } from "./webviewHtml.js";

export { createNonce, renderWebviewHtml, webviewDistRelative } from "./webviewHtml.js";

/** Typed message envelope for host ↔ webview (P18 platform). */
export interface WebviewMessage<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload?: TPayload;
}

export interface CreateWebviewOptions {
  /** Unique viewType for createWebviewPanel. */
  viewType: string;
  title: string;
  /**
   * Base name of the client bundle under dist/webviews/ (without .js).
   * Example: `graph` → dist/webviews/graph.js
   */
  scriptName: string;
  extensionUri: vscode.Uri;
  column?: vscode.ViewColumn;
  retainContextWhenHidden?: boolean;
  /** Extra CSP directives (rarely needed). */
  extraCsp?: string;
}

export interface GitSpecsWebview {
  panel: vscode.WebviewPanel;
  postMessage: (msg: WebviewMessage) => Thenable<boolean>;
  dispose: () => void;
}

/**
 * Create a GitSpecs webview panel with CSP nonce, theme CSS variables, and
 * the shared client script loader. All custom webviews must use this helper.
 */
export function createGitSpecsWebview(options: CreateWebviewOptions): GitSpecsWebview {
  const panel = vscode.window.createWebviewPanel(
    options.viewType,
    options.title,
    options.column ?? vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: options.retainContextWhenHidden ?? true,
      localResourceRoots: [
        vscode.Uri.joinPath(options.extensionUri, "dist", "webviews"),
        vscode.Uri.joinPath(options.extensionUri, "media"),
      ],
    },
  );

  const nonce = createNonce();
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(options.extensionUri, "dist", "webviews", `${options.scriptName}.js`),
  );

  panel.webview.html = renderWebviewHtml({
    cspSource: panel.webview.cspSource,
    nonce,
    scriptSrc: scriptUri.toString(),
    title: options.title,
    extraCsp: options.extraCsp,
  });

  return {
    panel,
    postMessage: (msg) => panel.webview.postMessage(msg),
    dispose: () => panel.dispose(),
  };
}


