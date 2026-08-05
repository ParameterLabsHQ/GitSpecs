import * as vscode from "vscode";
import type { HistoryCommit, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_COMMITS_LIMIT, formatCommitTreeRow } from "./format.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";

export type CommitNode = RepoRootItem | CommitItem;

export class CommitItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly commit: HistoryCommit, repoRoot: string) {
    const row = formatCommitTreeRow(commit);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = "commit";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("git-commit");
  }
}

export class CommitsProvider implements vscode.TreeDataProvider<CommitNode>, vscode.Disposable {
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

  getTreeItem(element: CommitNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CommitNode): Promise<CommitNode[]> {
    if (element instanceof CommitItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listCommits(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listCommits(all[0]!);
  }

  private async listCommits(repo: GitRepository): Promise<CommitItem[]> {
    try {
      const list = await repo.history.recent({ limit: DEFAULT_COMMITS_LIMIT });
      return list.map((c) => new CommitItem(c, repo.root));
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
