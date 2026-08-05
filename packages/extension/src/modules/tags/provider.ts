import * as vscode from "vscode";
import type { TagInfo, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { formatTagTreeRow } from "./format.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";

export type TagNode = RepoRootItem | TagItem;

export class TagItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly tag: TagInfo, repoRoot: string) {
    const row = formatTagTreeRow(tag);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = "tag";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("tag");
  }
}

export class TagsProvider implements vscode.TreeDataProvider<TagNode>, vscode.Disposable {
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

  getTreeItem(element: TagNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TagNode): Promise<TagNode[]> {
    if (element instanceof TagItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listTags(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listTags(all[0]!);
  }

  private async listTags(repo: GitRepository): Promise<TagItem[]> {
    try {
      const list = await repo.tags.list();
      return list.map((t) => new TagItem(t, repo.root));
    } catch (err) {
      await presentError(this.log, err, "Tags");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
