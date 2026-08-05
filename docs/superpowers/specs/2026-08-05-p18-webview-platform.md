# P18 — Webview platform + Commit Graph canvas (design note)

**Date:** 2026-08-05  
**Status:** implementation companion for roadmap P18

## Platform

- **Second esbuild target:** `src/webviews/*/main.ts` → `dist/webviews/*.js` (browser IIFE, no `vscode` import in client).
- **Host helper** (`shell/webviewHost.ts`): creates panels with CSP nonce, theme CSS variables, `asWebviewUri` script tags, typed `postMessage` envelope `{ type, payload }`, optional `getState`/`setState` via `webview.webview`.
- **Docs:** `docs/WEBVIEWS.md` — how to add a surface; CSP rules; protocol conventions.
- **Rule:** no ad-hoc webviews outside this helper (AGENTS + roadmap principle 7).

## Graph canvas

- View id / command: `gitspecs.graphView` / `gitspecs.graph.openView`.
- Data: existing `repo.graph.log` layout + **paged** loads (`skip` / higher effective cap via paging).
- UI: virtualized table of rows (lane glyph + SHA + subject + refs), WIP row, search filter, details side panel, actions postMessage → host runs existing commands.
- P11 tree remains for SCM tab / activity bar.

## Out of scope

Rewrite-in-graph (P19), PR rows (P21).
