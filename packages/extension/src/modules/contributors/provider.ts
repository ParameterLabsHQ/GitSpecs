import * as vscode from "vscode";
import type { ContributorInfo } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_CONTRIBUTORS_LIMIT, formatContributorTreeRow } from "./format.js";

export class ContributorItem extends vscode.TreeItem {
  constructor(readonly contributor: ContributorInfo) {
    const row = formatContributorTreeRow(contributor);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "contributor";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("person");
  }
}

export class ContributorsProvider
  implements vscode.TreeDataProvider<ContributorItem>, vscode.Disposable
{
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

  getTreeItem(element: ContributorItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ContributorItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) return [];
    try {
      const list = await repo.contributors.list({ limit: DEFAULT_CONTRIBUTORS_LIMIT });
      return list.map((c) => new ContributorItem(c));
    } catch (err) {
      await presentError(this.log, err, "Contributors");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
