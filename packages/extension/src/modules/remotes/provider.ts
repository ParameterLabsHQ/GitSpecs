import * as vscode from "vscode";
import type { RemoteInfo, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { formatRemoteTreeRow } from "./format.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";

export type RemoteNode = RepoRootItem | RemoteItem;

export class RemoteItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly remote: RemoteInfo, repoRoot: string) {
    const row = formatRemoteTreeRow(remote);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = "remote";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("cloud");
  }
}

export class RemotesProvider implements vscode.TreeDataProvider<RemoteNode>, vscode.Disposable {
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

  getTreeItem(element: RemoteNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RemoteNode): Promise<RemoteNode[]> {
    if (element instanceof RemoteItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listRemotes(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listRemotes(all[0]!);
  }

  private async listRemotes(repo: GitRepository): Promise<RemoteItem[]> {
    try {
      const list = await repo.remotes.list();
      return list.map((r) => new RemoteItem(r, repo.root));
    } catch (err) {
      await presentError(this.log, err, "Remotes");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
