import * as vscode from "vscode";
import type { TagInfo } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { formatTagTreeRow } from "./format.js";

export class TagItem extends vscode.TreeItem {
  constructor(readonly tag: TagInfo) {
    const row = formatTagTreeRow(tag);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "tag";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("tag");
  }
}

export class TagsProvider implements vscode.TreeDataProvider<TagItem>, vscode.Disposable {
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

  getTreeItem(element: TagItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<TagItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) return [];
    try {
      const list = await repo.tags.list();
      return list.map((t) => new TagItem(t));
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
