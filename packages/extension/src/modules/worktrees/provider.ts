import * as vscode from "vscode";
import * as path from "node:path";
import type { WorktreeInfo } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";

export class WorktreeItem extends vscode.TreeItem {
  constructor(readonly info: WorktreeInfo, currentRoot: string | undefined) {
    const label = path.basename(info.path);
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "worktree";
    const branch = info.branch ?? (info.detached ? "detached" : "");
    const flags: string[] = [];
    if (info.locked) flags.push("locked");
    if (info.prunable) flags.push("prunable");
    this.description = [branch, path.dirname(info.path), ...flags].filter(Boolean).join(" — ");
    this.tooltip = info.path;
    this.iconPath = new vscode.ThemeIcon(
      currentRoot && path.resolve(info.path) === path.resolve(currentRoot)
        ? "folder-active"
        : "folder",
    );
    this.resourceUri = vscode.Uri.file(info.path);
  }
}

export class WorktreesProvider implements vscode.TreeDataProvider<WorktreeItem>, vscode.Disposable {
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

  getTreeItem(element: WorktreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<WorktreeItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) {
      return [];
    }
    try {
      const list = await repo.worktrees.list();
      return list.map((w) => new WorktreeItem(w, repo.root));
    } catch (err) {
      await presentError(this.log, err, "Worktrees");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
