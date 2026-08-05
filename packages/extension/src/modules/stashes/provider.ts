import * as vscode from "vscode";
import type { StashInfo } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { formatStashTreeRow } from "./format.js";

export class StashItem extends vscode.TreeItem {
  constructor(readonly stash: StashInfo) {
    const row = formatStashTreeRow(stash);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "stash";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("archive");
  }
}

export class StashesProvider implements vscode.TreeDataProvider<StashItem>, vscode.Disposable {
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

  getTreeItem(element: StashItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<StashItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) return [];
    try {
      const list = await repo.stashes.list();
      return list.map((s) => new StashItem(s));
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
