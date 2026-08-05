import {
  churnMarkHeight,
  type FileHistoryHostMessage,
  type ChurnPointDto,
} from "./protocol.js";

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="fh">
    <header><strong id="title">Visual File History</strong></header>
    <div id="chart" class="chart"></div>
    <div id="detail" class="detail muted">Click a commit mark</div>
  </div>
  <style>
    .fh { display:flex; flex-direction:column; height:100%; padding:8px; box-sizing:border-box; }
    .chart { flex:1; display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding:12px 4px; border-bottom:1px solid var(--vscode-panel-border,#444); }
    .mark { width:14px; min-width:14px; background: var(--vscode-charts-blue, #3794ff); border-radius:2px 2px 0 0; cursor:pointer; position:relative; }
    .mark:hover, .mark.selected { background: var(--vscode-charts-orange, #e2c08d); }
    .detail { padding:8px 0; font-size:12px; }
    .muted { color: var(--vscode-descriptionForeground); }
    header { margin-bottom: 4px; }
  </style>
`;

const chart = document.getElementById("chart")!;
const detail = document.getElementById("detail")!;
const title = document.getElementById("title")!;
let points: ChurnPointDto[] = [];

window.addEventListener("message", (ev) => {
  const msg = ev.data as FileHistoryHostMessage;
  if (msg?.type === "fh:data") {
    points = msg.payload.points;
    title.textContent = `Visual File History — ${msg.payload.path}`;
    render();
  } else if (msg?.type === "fh:error") {
    detail.textContent = msg.payload.message;
  }
});

function render(): void {
  const max = Math.max(1, ...points.map((p) => p.additions + p.deletions));
  // oldest left → newest right
  const ordered = [...points].reverse();
  chart.innerHTML = ordered
    .map((p) => {
      const h = churnMarkHeight(p.additions, p.deletions, max);
      return `<div class="mark" data-sha="${p.sha}" style="height:${h}px" title="${escapeAttr(p.shortSha + " " + p.subject)}"></div>`;
    })
    .join("");
  chart.querySelectorAll(".mark").forEach((el) => {
    el.addEventListener("click", () => {
      chart.querySelectorAll(".mark").forEach((m) => m.classList.remove("selected"));
      el.classList.add("selected");
      const sha = (el as HTMLElement).dataset.sha!;
      const p = points.find((x) => x.sha === sha);
      if (p) {
        detail.innerHTML = `<code>${escapeHtml(p.shortSha)}</code> ${escapeHtml(p.subject)}<br/><span class="muted">${escapeHtml(p.author)} · +${p.additions}/-${p.deletions}</span>`;
      }
      vscode.postMessage({ type: "fh:open", payload: { sha } });
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

vscode.postMessage({ type: "fh:ready" });
