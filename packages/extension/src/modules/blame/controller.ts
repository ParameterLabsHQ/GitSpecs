import * as vscode from "vscode";
import * as path from "node:path";
import type { BlameLine } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import {
  formatLineBlame,
  formatEnrichedBlameHover,
  formatStatusBarBlame,
} from "./format.js";
import { BlameCache } from "./cache.js";
import {
  blameDetailActions,
  resolveCommitUrl,
  shouldShowStatusBarBlame,
  toDetailPayload,
  type BlameDetailPayload,
} from "./detail.js";

const STATUS_BAR_DEBOUNCE_MS = 200;
const DECORATION_DEBOUNCE_MS = 400;

function isDiskFile(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" && !doc.isUntitled;
}

function isUnderRepo(repoRoot: string, fsPath: string): boolean {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(fsPath);
  return abs === root || abs.startsWith(root + path.sep);
}

export class BlameController implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly statusBar: vscode.StatusBarItem;
  private readonly cache = new BlameCache();
  private enabled = false;
  private readonly disposables: vscode.Disposable[] = [];
  private decorationTimer: NodeJS.Timeout | undefined;
  private statusBarTimer: NodeJS.Timeout | undefined;
  /** Guards against stale async status-bar updates. */
  private statusBarSeq = 0;
  /** Guards against stale decoration refreshes. */
  private decorationSeq = 0;
  private lastStatusPayload: BlameDetailPayload | undefined;

  constructor(
    private readonly repos: RepoContext,
    private readonly log: PlatformLog,
  ) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      after: {
        margin: "0 0 0 2em",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
      },
    });
    this.disposables.push(this.decorationType);

    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBar.name = "GitSpecs Blame";
    this.statusBar.command = "gitspecs.blame.statusBarDetails";
    this.statusBar.tooltip = "GitSpecs: current line blame";
    this.disposables.push(this.statusBar);

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.enabled) void this.refreshActiveEditor();
        this.scheduleStatusBarRefresh();
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) {
          this.scheduleStatusBarRefresh();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) {
          if (this.enabled) this.scheduleDecorationRefresh();
          this.scheduleStatusBarRefresh();
        }
        // Invalidate cache for this file so CodeLens/status see edits
        const repo = this.repos.currentRepo;
        if (repo && e.document.uri.scheme === "file") {
          this.cache.invalidate(repo.root, e.document.uri.fsPath);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("gitspecs.blame.statusBar")) {
          this.scheduleStatusBarRefresh();
        }
      }),
      this.repos.onDidChange(() => {
        this.cache.clear();
        if (this.enabled) void this.refreshActiveEditor();
        this.scheduleStatusBarRefresh();
      }),
    );

    // Initial status bar (respects setting)
    this.scheduleStatusBarRefresh();
  }

  /** Shared cache for CodeLens / other blame surfaces. */
  get blameCache(): BlameCache {
    return this.cache;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.clearAll();
      void vscode.window.setStatusBarMessage("GitSpecs: File blame off", 2000);
      return;
    }
    void vscode.window.setStatusBarMessage("GitSpecs: File blame on", 2000);
    await this.refreshActiveEditor();
  }

  async showLine(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("No active editor");
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      void vscode.window.showInformationMessage("No Git repository selected");
      return;
    }
    const file = editor.document.uri.fsPath;
    if (!isDiskFile(editor.document)) {
      void vscode.window.showInformationMessage("Blame requires a saved file on disk");
      return;
    }
    const lineNumber = editor.selection.active.line + 1;
    try {
      const versionKey = String(editor.document.version);
      const line = await this.cache.getLine(repo, file, versionKey, lineNumber);
      if (!line) {
        void vscode.window.showInformationMessage("No blame information for this line");
        return;
      }
      await this.showBlameDetail(toDetailPayload(line));
    } catch (err) {
      await presentError(this.log, err, "Blame line");
    }
  }

  async blameFileToOutput(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isDiskFile(editor.document)) {
      void vscode.window.showInformationMessage("Open a file on disk to blame");
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      void vscode.window.showInformationMessage("No Git repository selected");
      return;
    }
    try {
      const rows = await this.cache.get(
        repo,
        editor.document.uri.fsPath,
        String(editor.document.version),
      );
      this.log.info(`Blame ${path.basename(editor.document.uri.fsPath)} (${rows.length} lines)`);
      for (const row of rows) {
        this.log.info(`L${row.lineNumber}\t${formatLineBlame(row)}`);
      }
      this.log.show();
    } catch (err) {
      await presentError(this.log, err, "Blame file");
    }
  }

  /**
   * Status-bar click handler: re-resolve current cursor line (avoid stale payload races).
   */
  async showStatusBarDetails(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor && isDiskFile(editor.document) && this.repos.currentRepo) {
      await this.showLine();
      return;
    }
    if (this.lastStatusPayload) {
      await this.showBlameDetail(this.lastStatusPayload);
      return;
    }
    void vscode.window.showInformationMessage("No blame information for this line");
  }

  /**
   * Shared detail UX for status bar, CodeLens, and show-line.
   * Actions: show message, copy SHA, open commit URL when remote parseable.
   */
  async showBlameDetail(payload: BlameDetailPayload): Promise<void> {
    const repo = this.repos.currentRepo;
    let commitUrlStr: string | undefined;
    if (repo) {
      try {
        const remoteUrl = await repo.branches.getRemoteUrl("origin");
        commitUrlStr = resolveCommitUrl(remoteUrl, payload.sha);
      } catch {
        commitUrlStr = undefined;
      }
    }

    const actions = blameDetailActions(Boolean(commitUrlStr));
    const header = [
      payload.author,
      payload.sha.slice(0, 7),
      payload.summary,
    ]
      .filter(Boolean)
      .join(" • ");

    const pick = await vscode.window.showQuickPick(
      actions.map((a) => ({ label: a.label, id: a.id })),
      {
        title: "GitSpecs Blame",
        placeHolder: header,
      },
    );
    if (!pick) return;

    switch (pick.id) {
      case "showMessage": {
        const msg = payload.summary?.trim()
          ? `${payload.summary}\n\n${payload.sha}`
          : `(no commit message)\n\n${payload.sha}`;
        await vscode.window.showInformationMessage(msg, { modal: false });
        break;
      }
      case "copySha":
        await vscode.env.clipboard.writeText(payload.sha);
        void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
        break;
      case "openCommitUrl":
        if (commitUrlStr) {
          await vscode.env.openExternal(vscode.Uri.parse(commitUrlStr));
        }
        break;
    }
  }

  private scheduleDecorationRefresh(): void {
    if (this.decorationTimer) clearTimeout(this.decorationTimer);
    this.decorationTimer = setTimeout(() => {
      void this.refreshActiveEditor();
    }, DECORATION_DEBOUNCE_MS);
  }

  private scheduleStatusBarRefresh(): void {
    if (this.statusBarTimer) clearTimeout(this.statusBarTimer);
    this.statusBarTimer = setTimeout(() => {
      void this.refreshStatusBar();
    }, STATUS_BAR_DEBOUNCE_MS);
  }

  private statusBarSettingEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("blame.statusBar", true);
  }

  private async refreshStatusBar(): Promise<void> {
    const seq = ++this.statusBarSeq;
    const enabled = this.statusBarSettingEnabled();
    const editor = vscode.window.activeTextEditor;
    const repo = this.repos.currentRepo;

    if (
      !shouldShowStatusBarBlame(
        enabled,
        Boolean(repo),
        Boolean(editor && isDiskFile(editor.document)),
        true, // line checked below
      )
    ) {
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
      this.statusBar.text = "";
      return;
    }

    if (!editor || !repo || !isDiskFile(editor.document)) {
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
      return;
    }

    const fsPath = editor.document.uri.fsPath;
    if (!isUnderRepo(repo.root, fsPath)) {
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
      return;
    }

    const lineNumber = editor.selection.active.line + 1;
    const versionKey = String(editor.document.version);

    try {
      const line = await this.cache.getLine(repo, fsPath, versionKey, lineNumber);
      if (seq !== this.statusBarSeq) return; // stale
      if (!line) {
        this.lastStatusPayload = undefined;
        this.statusBar.hide();
        return;
      }
      this.lastStatusPayload = toDetailPayload(line);
      this.statusBar.text = `$(git-commit) ${formatStatusBarBlame(line)}`;
      this.statusBar.tooltip = formatEnrichedBlameHover(line);
      this.statusBar.show();
    } catch (err) {
      if (seq !== this.statusBarSeq) return;
      this.log.debug(
        `status bar blame failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
    }
  }

  private async refreshActiveEditor(): Promise<void> {
    const seq = ++this.decorationSeq;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.enabled) return;
    if (!isDiskFile(editor.document)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    const fsPath = editor.document.uri.fsPath;
    if (!isUnderRepo(repo.root, fsPath)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    try {
      const versionKey = String(editor.document.version);
      const rows = await this.cache.get(repo, fsPath, versionKey);
      if (seq !== this.decorationSeq) return;
      if (vscode.window.activeTextEditor !== editor) return;

      const byLine = new Map<number, BlameLine>();
      for (const r of rows) {
        byLine.set(r.lineNumber, r);
      }

      const decorations: vscode.DecorationOptions[] = [];
      for (let i = 0; i < editor.document.lineCount; i++) {
        const lineNo = i + 1;
        const blame = byLine.get(lineNo);
        if (!blame) continue;
        const range = editor.document.lineAt(i).range;
        decorations.push({
          range,
          renderOptions: {
            after: {
              contentText: formatLineBlame(blame),
            },
          },
          hoverMessage: new vscode.MarkdownString(formatEnrichedBlameHover(blame)),
        });
      }
      editor.setDecorations(this.decorationType, decorations);
    } catch (err) {
      if (seq !== this.decorationSeq) return;
      this.log.debug(`blame refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      editor.setDecorations(this.decorationType, []);
    }
  }

  private clearAll(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      ed.setDecorations(this.decorationType, []);
    }
  }

  dispose(): void {
    if (this.decorationTimer) clearTimeout(this.decorationTimer);
    if (this.statusBarTimer) clearTimeout(this.statusBarTimer);
    this.clearAll();
    this.cache.clear();
    this.statusBar.hide();
    for (const d of this.disposables) d.dispose();
  }
}
