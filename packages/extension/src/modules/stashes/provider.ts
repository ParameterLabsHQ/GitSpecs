import * as vscode from "vscode";
import type { StashInfo, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { formatStashTreeRow } from "./format.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";

export type StashNode = RepoRootItem | StashItem;

export class StashItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly stash: StashInfo, repoRoot: string) {
    const row = formatStashTreeRow(stash);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = "stash";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("archive");
  }
}

export class StashesProvider implements vscode.TreeDataProvider<StashNode>, vscode.Disposable {
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

  getTreeItem(element: StashNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StashNode): Promise<StashNode[]> {
    if (element instanceof StashItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listStashes(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listStashes(all[0]!);
  }

  private async listStashes(repo: GitRepository): Promise<StashItem[]> {
    try {
      const list = await repo.stashes.list();
      return list.map((s) => new StashItem(s, repo.root));
    } catch (err) {
      await presentError(this.log, err, "Stashes");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
