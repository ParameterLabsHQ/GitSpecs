import {
  formatCompareHeader,
  type CompareHostMessage,
  type CompareDataDto,
} from "./protocol.js";

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="cmp">
    <header id="header" class="header">Compare</header>
    <div class="panes">
      <section class="pane">
        <h3>Summary</h3>
        <pre id="summary" class="summary muted"></pre>
      </section>
      <section class="pane">
        <h3>Files</h3>
        <div id="files" class="files"></div>
      </section>
    </div>
  </div>
  <style>
    .cmp { display:flex; flex-direction:column; height:100%; }
    .header { padding:8px 12px; border-bottom:1px solid var(--vscode-panel-border,#444); font-weight:600; }
    .panes { display:flex; flex:1; min-height:0; }
    .pane { flex:1; overflow:auto; padding:8px 12px; border-right:1px solid var(--vscode-panel-border,#444); }
    .pane:last-child { border-right:none; }
    .files .file { padding:4px 0; cursor:pointer; font-family: var(--vscode-editor-font-family, monospace); font-size:12px; }
    .files .file:hover { color: var(--vscode-textLink-foreground); }
    .muted { color: var(--vscode-descriptionForeground); }
    .summary { white-space: pre-wrap; font-size:12px; }
    h3 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; opacity:0.8; }
  </style>
`;

const header = document.getElementById("header")!;
const summary = document.getElementById("summary")!;
const filesEl = document.getElementById("files")!;

window.addEventListener("message", (ev) => {
  const msg = ev.data as CompareHostMessage;
  if (msg?.type === "cmp:data") render(msg.payload);
  if (msg?.type === "cmp:error") summary.textContent = msg.payload.message;
});

function render(d: CompareDataDto): void {
  header.textContent = formatCompareHeader(d);
  summary.textContent = [
    `Base: ${d.base}`,
    `Head: ${d.head}`,
    `Ahead: ${d.ahead}  Behind: ${d.behind}`,
    d.shortstat || "(no shortstat)",
  ].join("\n");
  filesEl.innerHTML = d.files
    .map(
      (f) =>
        `<div class="file" data-path="${escapeAttr(f.path)}"><span class="muted">${escapeHtml(f.status)}</span> ${escapeHtml(f.path)}</div>`,
    )
    .join("") || `<div class="muted">No files</div>`;
  filesEl.querySelectorAll(".file").forEach((el) => {
    el.addEventListener("click", () => {
      const path = (el as HTMLElement).dataset.path!;
      vscode.postMessage({ type: "cmp:openFile", payload: { path } });
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

vscode.postMessage({ type: "cmp:ready" });
