import * as vscode from "vscode";
import type { WorktreeItem, WorktreesProvider } from "../modules/worktrees/provider.js";
import type { BranchNode, BranchesProvider } from "../modules/branches/provider.js";
import type { CommitItem, CommitsProvider } from "../modules/commits/provider.js";
import type { StashItem, StashesProvider } from "../modules/stashes/provider.js";
import type { ScmTabState } from "./scmTabs.js";

export type ScmTreeNode = WorktreeItem | BranchNode | CommitItem | StashItem;

/**
 * Facade TreeDataProvider for the single consolidated SCM view.
 * Delegates by active {@link ScmTabState}.
 */
export class ScmGroupedProvider implements vscode.TreeDataProvider<ScmTreeNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ScmTreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly unsubTab: () => void;

  constructor(
    private readonly tabState: ScmTabState,
    private readonly worktrees: WorktreesProvider,
    private readonly branches: BranchesProvider,
    private readonly commits: CommitsProvider,
    private readonly stashes: StashesProvider,
  ) {
    this.unsubTab = tabState.onDidChange(() => this._onDidChangeTreeData.fire());
    this.disposables.push(
      worktrees.onDidChangeTreeData(() => {
        if (this.tabState.active === "worktrees") this._onDidChangeTreeData.fire();
      }),
      branches.onDidChangeTreeData(() => {
        if (this.tabState.active === "branches") this._onDidChangeTreeData.fire();
      }),
      commits.onDidChangeTreeData(() => {
        if (this.tabState.active === "commits") this._onDidChangeTreeData.fire();
      }),
      stashes.onDidChangeTreeData(() => {
        if (this.tabState.active === "stashes") this._onDidChangeTreeData.fire();
      }),
      this._onDidChangeTreeData,
    );
  }

  getTreeItem(element: ScmTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ScmTreeNode): Promise<ScmTreeNode[]> {
    const tab = this.tabState.active;
    if (tab === "worktrees") {
      if (element) return [];
      return this.worktrees.getChildren();
    }
    if (tab === "commits") {
      if (element) return [];
      return this.commits.getChildren();
    }
    if (tab === "stashes") {
      if (element) return [];
      return this.stashes.getChildren();
    }
    return this.branches.getChildren(element as BranchNode | undefined);
  }

  dispose(): void {
    this.unsubTab();
    for (const d of this.disposables) d.dispose();
  }
}
