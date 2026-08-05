import * as vscode from "vscode";
import type { HistoryCommit } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_COMMITS_LIMIT, formatCommitTreeRow } from "./format.js";

export class CommitItem extends vscode.TreeItem {
  constructor(readonly commit: HistoryCommit) {
    const row = formatCommitTreeRow(commit);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "commit";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("git-commit");
  }
}

export class CommitsProvider implements vscode.TreeDataProvider<CommitItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly repos: RepoContext,
    refresh: RefreshBus,
    private readonly log: PlatformLog,
  ) {
    this.disposables.push(
      refresh.onDidRefresh(() => this._onDidChangeTreeData.fire()),
      repos.onDidChange(() => this._onDidChangeTreeData.fire()),
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<CommitItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) return [];

    try {
      const list = await repo.history.recent({ limit: DEFAULT_COMMITS_LIMIT });
      return list.map((c) => new CommitItem(c));
    } catch (err) {
      await presentError(this.log, err, "Commits");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
