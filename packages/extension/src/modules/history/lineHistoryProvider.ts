import * as vscode from "vscode";
import * as path from "node:path";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_HISTORY_LIMIT, toHistoryCommitItem } from "./actions.js";
import { FileHistoryCommitItem } from "./fileHistoryProvider.js";

/**
 * Persistent Line History tree: follows active selection unless pinned.
 */
export class LineHistoryProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<void | vscode.TreeItem | null>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private pinned = false;
  private pinnedPath: string | undefined;
  private pinnedStart = 1;
  private pinnedEnd = 1;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repos: RepoContext,
    private readonly log: PlatformLog,
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (!this.pinned) this.scheduleRefresh();
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (!this.pinned && e.textEditor === vscode.window.activeTextEditor) {
          this.scheduleRefresh();
        }
      }),
      this.repos.onDidChange(() => this.scheduleRefresh()),
    );
    this.scheduleRefresh();
  }

  get isPinned(): boolean {
    return this.pinned;
  }

  togglePin(): void {
    if (this.pinned) {
      this.pinned = false;
      this.pinnedPath = undefined;
    } else {
      const range = this.resolveSelection();
      if (!range) {
        void vscode.window.showInformationMessage("Open a file to pin line history");
        return;
      }
      this.pinned = true;
      this.pinnedPath = range.filePath;
      this.pinnedStart = range.startLine;
      this.pinnedEnd = range.endLine;
    }
    this.fire();
  }

  refresh(): void {
    this.fire();
  }

  private fire(): void {
    this._onDidChange.fire();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.fire(), 250);
  }

  private resolveSelection():
    | { filePath: string; startLine: number; endLine: number }
    | undefined {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== "file" || ed.document.isUntitled) {
      return undefined;
    }
    const sel = ed.selection;
    let startLine = sel.start.line + 1;
    let endLine = sel.end.line + 1;
    if (sel.isEmpty) {
      endLine = startLine;
    } else if (sel.end.character === 0 && endLine > startLine) {
      endLine = endLine - 1;
    }
    return { filePath: ed.document.uri.fsPath, startLine, endLine };
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    const range = this.pinned
      ? this.pinnedPath
        ? {
            filePath: this.pinnedPath,
            startLine: this.pinnedStart,
            endLine: this.pinnedEnd,
          }
        : undefined
      : this.resolveSelection();

    if (!range) {
      const empty = new vscode.TreeItem("Select lines to show history");
      empty.contextValue = "lineHistoryEmpty";
      return [empty];
    }

    const repo = this.repos.repoForPath(range.filePath) ?? this.repos.currentRepo;
    if (!repo) {
      return [new vscode.TreeItem("No Git repository")];
    }

    const rangeLabel =
      range.startLine === range.endLine
        ? `L${range.startLine}`
        : `L${range.startLine}–${range.endLine}`;
    const header = new vscode.TreeItem(
      `${path.basename(range.filePath)} ${rangeLabel}`,
      vscode.TreeItemCollapsibleState.None,
    );
    header.description = this.pinned ? "pinned" : "following selection";
    header.iconPath = new vscode.ThemeIcon(this.pinned ? "pinned" : "git-commit");
    header.contextValue = "lineHistoryHeader";

    try {
      const commits = await repo.history.line(range.filePath, {
        startLine: range.startLine,
        endLine: range.endLine,
        limit: DEFAULT_HISTORY_LIMIT,
      });
      const items: vscode.TreeItem[] = [header];
      for (const c of commits) {
        const item = toHistoryCommitItem(c, range.filePath);
        items.push(new FileHistoryCommitItem(item, repo.root));
      }
      if (commits.length === 0) {
        items.push(new vscode.TreeItem("No line history for this selection"));
      }
      return items;
    } catch (err) {
      this.log.debug(
        `line history view: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [
        header,
        new vscode.TreeItem(
          `History failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      ];
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this._onDidChange.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
