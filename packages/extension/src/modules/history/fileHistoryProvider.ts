import * as vscode from "vscode";
import * as path from "node:path";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import {
  DEFAULT_HISTORY_LIMIT,
  formatHistoryPickLabel,
  historyAutolinkDetail,
  toHistoryCommitItem,
  type HistoryCommitItem,
} from "./actions.js";
import { readAutolinkRules } from "../autolinks/settings.js";

export class FileHistoryCommitItem extends vscode.TreeItem {
  readonly kind = "fileHistoryCommit" as const;
  constructor(
    public readonly commit: HistoryCommitItem,
    public readonly repoRoot: string,
  ) {
    const label = formatHistoryPickLabel({
      sha: commit.sha,
      subject: commit.subject,
      author: commit.author,
      authorTime: commit.authorTime,
    });
    super(label.label, vscode.TreeItemCollapsibleState.None);
    this.description = label.description;
    this.detail = label.detail;
    this.contextValue = "fileHistoryCommit";
    this.iconPath = new vscode.ThemeIcon("git-commit");
    this.tooltip = `${commit.subject}\n${commit.author}\n${commit.sha}`;
    this.command = {
      command: "gitspecs.history.viewCommitActions",
      title: "History actions",
      arguments: [commit, repoRoot],
    };
  }
}

/**
 * Persistent File History tree: follows active editor unless pinned.
 */
export class FileHistoryProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<void | vscode.TreeItem | null>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private pinned = false;
  private pinnedPath: string | undefined;
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
      const p = this.resolveEditorPath();
      if (!p) {
        void vscode.window.showInformationMessage("Open a file to pin its history");
        return;
      }
      this.pinned = true;
      this.pinnedPath = p;
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
    this.refreshTimer = setTimeout(() => this.fire(), 200);
  }

  private resolveEditorPath(): string | undefined {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== "file" || ed.document.isUntitled) {
      return undefined;
    }
    return ed.document.uri.fsPath;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return [];

    const filePath = this.pinned ? this.pinnedPath : this.resolveEditorPath();
    if (!filePath) {
      const empty = new vscode.TreeItem("Open a file to show history");
      empty.contextValue = "fileHistoryEmpty";
      return [empty];
    }

    const repo = this.repos.repoForPath(filePath) ?? this.repos.currentRepo;
    if (!repo) {
      return [new vscode.TreeItem("No Git repository")];
    }

    const header = new vscode.TreeItem(
      path.basename(filePath),
      vscode.TreeItemCollapsibleState.None,
    );
    header.description = this.pinned ? "pinned" : "following editor";
    header.iconPath = new vscode.ThemeIcon(this.pinned ? "pinned" : "history");
    header.contextValue = "fileHistoryHeader";
    header.tooltip = filePath;

    try {
      const commits = await repo.history.file(filePath, { limit: DEFAULT_HISTORY_LIMIT });
      const rules = readAutolinkRules();
      const items: vscode.TreeItem[] = [header];
      for (const c of commits) {
        const item = toHistoryCommitItem(c, filePath);
        const tree = new FileHistoryCommitItem(item, repo.root);
        const detail = historyAutolinkDetail(c.subject, rules);
        if (detail) {
          tree.detail = [tree.detail, detail].filter(Boolean).join(" · ");
        }
        items.push(tree);
      }
      if (commits.length === 0) {
        items.push(new vscode.TreeItem("No history for this file"));
      }
      return items;
    } catch (err) {
      this.log.debug(
        `file history view: ${err instanceof Error ? err.message : String(err)}`,
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
