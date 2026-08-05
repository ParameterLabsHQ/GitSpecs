/**
 * Interactive rebase sequence editor client (P19).
 */
import type { RebaseHostMessage, RebaseRowDto, RebaseAction } from "./protocol.js";

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

const app = document.getElementById("app");
if (!app) throw new Error("#app missing");

let rows: RebaseRowDto[] = [];
let onto = "";

app.innerHTML = `
  <div class="rebase-layout">
    <header class="toolbar">
      <strong>Interactive Rebase</strong>
      <span id="onto" class="muted"></span>
      <span style="flex:1"></span>
      <button type="button" id="apply">Apply</button>
      <button type="button" id="abort">Cancel</button>
    </header>
    <div id="list" class="list"></div>
  </div>
  <style>
    .rebase-layout { display:flex; flex-direction:column; height:100%; }
    .toolbar { display:flex; gap:8px; align-items:center; padding:8px; border-bottom:1px solid var(--vscode-panel-border,#444); }
    .list { flex:1; overflow:auto; font-family: var(--vscode-editor-font-family, monospace); font-size:12px; }
    .row { display:grid; grid-template-columns: 28px 100px 90px 1fr; gap:6px; padding:4px 8px; align-items:center; border-bottom:1px solid color-mix(in srgb, var(--vscode-foreground) 8%, transparent); }
    .row.comment { opacity:0.55; font-style:italic; }
    .muted { color: var(--vscode-descriptionForeground); }
    select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border:1px solid var(--vscode-dropdown-border, transparent); }
    button.move { padding: 2px 6px; }
  </style>
`;

const listEl = document.getElementById("list")!;
const ontoEl = document.getElementById("onto")!;

document.getElementById("apply")!.addEventListener("click", () => {
  vscode.postMessage({ type: "rebase:apply", payload: { rows } });
});
document.getElementById("abort")!.addEventListener("click", () => {
  vscode.postMessage({ type: "rebase:abort" });
});

window.addEventListener("message", (ev) => {
  const msg = ev.data as RebaseHostMessage;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "rebase:load") {
    rows = msg.payload.rows.map((r) => ({ ...r }));
    onto = msg.payload.onto;
    ontoEl.textContent = `onto ${onto}`;
    render();
  }
});

function render(): void {
  const actions: RebaseAction[] = ["pick", "reword", "edit", "squash", "fixup", "drop"];
  listEl.innerHTML = rows
    .map((r, i) => {
      if (r.isComment) {
        return `<div class="row comment"><span></span><span></span><span></span><span>${escapeHtml(r.raw)}</span></div>`;
      }
      const opts = actions
        .map(
          (a) =>
            `<option value="${a}"${a === r.action ? " selected" : ""}>${a}</option>`,
        )
        .join("");
      return `<div class="row" data-i="${i}">
        <span>
          <button type="button" class="move" data-dir="-1" title="Up">↑</button>
          <button type="button" class="move" data-dir="1" title="Down">↓</button>
        </span>
        <select data-action>${opts}</select>
        <span class="sha">${escapeHtml(r.sha?.slice(0, 7) ?? "")}</span>
        <span>${escapeHtml(r.subject || r.raw)}</span>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("select[data-action]").forEach((el) => {
    el.addEventListener("change", () => {
      const row = (el as HTMLElement).closest(".row") as HTMLElement;
      const i = Number(row.dataset.i);
      if (!Number.isFinite(i) || !rows[i]) return;
      rows[i] = { ...rows[i]!, action: (el as HTMLSelectElement).value as RebaseAction };
    });
  });
  listEl.querySelectorAll("button.move").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = (btn as HTMLElement).closest(".row") as HTMLElement;
      const i = Number(row.dataset.i);
      const dir = Number((btn as HTMLElement).dataset.dir);
      if (!Number.isFinite(i) || !rows[i] || rows[i]!.isComment) return;
      const j = i + dir;
      if (j < 0 || j >= rows.length || rows[j]!.isComment) return;
      const tmp = rows[i]!;
      rows[i] = rows[j]!;
      rows[j] = tmp;
      render();
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

vscode.postMessage({ type: "rebase:ready" });
