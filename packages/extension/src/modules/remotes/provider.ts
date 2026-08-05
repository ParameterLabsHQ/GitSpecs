import * as vscode from "vscode";
import type { RemoteInfo } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { formatRemoteTreeRow } from "./format.js";

export class RemoteItem extends vscode.TreeItem {
  constructor(readonly remote: RemoteInfo) {
    const row = formatRemoteTreeRow(remote);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "remote";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon("cloud");
  }
}

export class RemotesProvider implements vscode.TreeDataProvider<RemoteItem>, vscode.Disposable {
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

  getTreeItem(element: RemoteItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<RemoteItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) return [];
    try {
      const list = await repo.remotes.list();
      return list.map((r) => new RemoteItem(r));
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
