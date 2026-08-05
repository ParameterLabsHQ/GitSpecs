/**
 * Commit Graph canvas client (P18).
 * Runs in the webview; talks to the host via acquireVsCodeApi().
 */
import {
  filterGraphRows,
  type GraphHostMessage,
  type GraphPageDto,
  type GraphRowDto,
} from "./protocol.js";

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

interface UiState {
  filter: string;
  selectedSha?: string;
}

const state: {
  rows: GraphRowDto[];
  hasMore: boolean;
  skipNext: number;
  limit: number;
  filter: string;
  selectedSha?: string;
  wip?: GraphPageDto["wip"];
  repoRoot?: string;
} = {
  rows: [],
  hasMore: false,
  skipNext: 0,
  limit: 200,
  filter: "",
};

function loadUiState(): void {
  const s = vscode.getState() as UiState | undefined;
  if (s?.filter) state.filter = s.filter;
  if (s?.selectedSha) state.selectedSha = s.selectedSha;
}

function saveUiState(): void {
  vscode.setState({ filter: state.filter, selectedSha: state.selectedSha } satisfies UiState);
}

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app missing");
}

app.innerHTML = `
  <div class="graph-layout">
    <div class="graph-toolbar">
      <input type="search" id="filter" placeholder="Filter message, author, SHA…" />
      <button type="button" id="reload">Reload</button>
      <button type="button" id="more" disabled>Load more</button>
      <span id="status" class="status"></span>
    </div>
    <div class="graph-body">
      <div class="graph-list" id="list" role="list"></div>
      <aside class="graph-details" id="details">
        <h3>Details</h3>
        <div id="detailBody" class="muted">Select a commit</div>
        <div class="actions" id="actions" hidden>
          <button type="button" data-action="copySha">Copy SHA</button>
          <button type="button" data-action="checkout">Checkout</button>
          <button type="button" data-action="createBranch">Create branch</button>
          <button type="button" data-action="compare">Compare</button>
          <button type="button" data-action="openRemote">Open remote</button>
        </div>
      </aside>
    </div>
  </div>
  <style>
    .graph-layout { display: flex; flex-direction: column; height: 100%; }
    .graph-toolbar {
      display: flex; gap: 8px; align-items: center;
      padding: 8px; border-bottom: 1px solid var(--vscode-panel-border, #444);
    }
    .graph-toolbar input[type="search"] { flex: 1; min-width: 120px; }
    .graph-body { display: flex; flex: 1; min-height: 0; }
    .graph-list {
      flex: 1; overflow: auto; font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    .graph-details {
      width: 280px; border-left: 1px solid var(--vscode-panel-border, #444);
      padding: 12px; overflow: auto;
    }
    .row {
      display: grid;
      grid-template-columns: 72px 72px 1fr auto;
      gap: 8px;
      padding: 4px 8px;
      cursor: pointer;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
    }
    .row:hover, .row.selected {
      background: var(--vscode-list-hoverBackground, rgba(127,127,127,0.15));
    }
    .row.selected { background: var(--vscode-list-activeSelectionBackground, rgba(0,120,212,0.35)); }
    .row.wip { font-style: italic; opacity: 0.9; }
    .glyph { white-space: pre; color: var(--vscode-descriptionForeground); }
    .sha { color: var(--vscode-textLink-foreground); }
    .refs { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
    .muted { color: var(--vscode-descriptionForeground); }
    .status { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .actions { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .actions button { text-align: left; }
    h3 { margin: 0 0 8px; font-size: 13px; }
  </style>
`;

const listEl = document.getElementById("list")!;
const filterEl = document.getElementById("filter") as HTMLInputElement;
const moreBtn = document.getElementById("more") as HTMLButtonElement;
const reloadBtn = document.getElementById("reload") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const detailBody = document.getElementById("detailBody")!;
const actionsEl = document.getElementById("actions")!;

loadUiState();
filterEl.value = state.filter;

filterEl.addEventListener("input", () => {
  state.filter = filterEl.value;
  saveUiState();
  renderList();
});

reloadBtn.addEventListener("click", () => {
  state.rows = [];
  state.skipNext = 0;
  vscode.postMessage({
    type: "graph:requestPage",
    payload: { skip: 0, limit: state.limit, filter: state.filter },
  });
});

moreBtn.addEventListener("click", () => {
  vscode.postMessage({
    type: "graph:requestPage",
    payload: { skip: state.skipNext, limit: state.limit, filter: state.filter },
  });
});

actionsEl.addEventListener("click", (ev) => {
  const t = (ev.target as HTMLElement).closest("button[data-action]") as HTMLButtonElement | null;
  if (!t || !state.selectedSha) return;
  const action = t.dataset.action as
    | "copySha"
    | "checkout"
    | "createBranch"
    | "compare"
    | "openRemote";
  vscode.postMessage({
    type: "graph:action",
    payload: { action, sha: state.selectedSha },
  });
});

window.addEventListener("message", (event) => {
  const msg = event.data as GraphHostMessage;
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "graph:page":
      applyPage(msg.payload, false);
      break;
    case "graph:append":
      applyPage(msg.payload, true);
      break;
    case "graph:error":
      statusEl.textContent = msg.payload.message;
      break;
    default:
      break;
  }
});

function applyPage(page: GraphPageDto, append: boolean): void {
  state.repoRoot = page.repoRoot;
  state.wip = page.wip;
  state.limit = page.limit;
  state.hasMore = page.hasMore;
  state.skipNext = page.skip + page.commits.length;
  if (append) {
    const seen = new Set(state.rows.map((r) => r.sha));
    for (const c of page.commits) {
      if (!seen.has(c.sha)) state.rows.push(c);
    }
  } else {
    state.rows = page.commits;
  }
  statusEl.textContent = `${state.rows.length} commits${state.hasMore ? " · more available" : ""}`;
  moreBtn.disabled = !state.hasMore;
  renderList();
  if (state.selectedSha) selectSha(state.selectedSha, false);
}

function renderList(): void {
  const filtered = filterGraphRows(state.rows, state.filter);
  // Simple windowing: render up to 400 DOM rows (virtualized-ish cap).
  const WINDOW = 400;
  const slice = filtered.slice(0, WINDOW);
  const parts: string[] = [];
  if (state.wip?.dirty) {
    parts.push(
      `<div class="row wip" data-sha="WIP" role="listitem">
        <span class="glyph">●</span>
        <span class="sha">WIP</span>
        <span>${escapeHtml(state.wip.summary || "Working tree changes")}</span>
        <span class="refs"></span>
      </div>`,
    );
  }
  for (const r of slice) {
    const sel = r.sha === state.selectedSha ? " selected" : "";
    parts.push(
      `<div class="row${sel}" data-sha="${escapeAttr(r.sha)}" role="listitem">
        <span class="glyph">${escapeHtml(r.graph)}</span>
        <span class="sha">${escapeHtml(r.shortSha)}</span>
        <span>${escapeHtml(r.subject)}</span>
        <span class="refs">${escapeHtml(r.refs.join(" "))}</span>
      </div>`,
    );
  }
  if (filtered.length > WINDOW) {
    parts.push(
      `<div class="muted" style="padding:8px">Showing ${WINDOW} of ${filtered.length} filtered rows — refine filter or load less.</div>`,
    );
  }
  listEl.innerHTML = parts.join("") || `<div class="muted" style="padding:8px">No commits</div>`;
  listEl.querySelectorAll(".row[data-sha]").forEach((el) => {
    el.addEventListener("click", () => {
      const sha = (el as HTMLElement).dataset.sha;
      if (!sha || sha === "WIP") return;
      selectSha(sha, true);
    });
  });
}

function selectSha(sha: string, notify: boolean): void {
  state.selectedSha = sha;
  saveUiState();
  const row = state.rows.find((r) => r.sha === sha);
  if (!row) {
    detailBody.textContent = "Select a commit";
    actionsEl.hidden = true;
    renderList();
    return;
  }
  detailBody.innerHTML = `
    <div><code>${escapeHtml(row.sha)}</code></div>
    <p>${escapeHtml(row.subject)}</p>
    <div class="muted">${escapeHtml(row.author)}</div>
    <div class="muted">${row.authorTime ? new Date(row.authorTime * 1000).toISOString() : ""}</div>
    <div class="refs">${escapeHtml(row.refs.join(", "))}</div>
    <div class="muted">lane ${row.lane} · parents ${row.parents.map((p) => p.slice(0, 7)).join(" ") || "—"}</div>
  `;
  actionsEl.hidden = false;
  renderList();
  if (notify) {
    vscode.postMessage({ type: "graph:select", payload: { sha } });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

vscode.postMessage({ type: "graph:ready" });
