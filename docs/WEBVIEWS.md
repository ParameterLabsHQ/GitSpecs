# GitSpecs webviews

Custom webviews are allowed **only** through the shared platform in `packages/extension/src/shell/webviewHost.ts`. Do not call `createWebviewPanel` ad hoc.

## Adding a surface

1. **Client bundle** under `packages/extension/src/webviews/<name>/main.ts` (and optional `styles.css` inlined or imported).
2. **Protocol** pure types under `packages/extension/src/webviews/<name>/protocol.ts` (shared shape for host + tests; no `vscode`).
3. **Host controller** that calls `createGitSpecsWebview({ id, title, scriptName, retainContextWhenHidden })` and wires `onDidReceiveMessage`.
4. **esbuild:** entry is picked up by the webview build in `esbuild.mjs` → `dist/webviews/<name>.js`.
5. Contribute a command / view in `package.json` if user-visible.

## CSP

HTML is generated with a random **nonce**. Scripts must use `nonce="<nonce>"`. Default CSP:

```
default-src 'none';
img-src ${cspSource} https: data:;
style-src ${cspSource} 'unsafe-inline';
script-src 'nonce-${nonce}';
```

No remote script CDNs. Theme colors use VS Code CSS variables (`var(--vscode-*)`).

## Message protocol

Envelope:

```ts
{ type: string; payload?: unknown }
```

- Host → client: `ready`, domain-specific data messages, `error`.
- Client → host: actions (`action:*`), `requestMore`, `ready`.
- Prefer pure protocol modules so unit tests assert shapes without the extension host.

## State

Use `webview.webview.getState()` / `setState()` for lightweight UI persistence (filter text, selected sha). Do not store secrets.

## Graph canvas (P18)

- Command: **GitSpecs: Open Commit Graph View** (`gitspecs.graph.openView`).
- Performance: first page default 200 commits; load more appends pages (skip). Documented max page size matches `MAX_GRAPH_LIMIT` (500) per page.
