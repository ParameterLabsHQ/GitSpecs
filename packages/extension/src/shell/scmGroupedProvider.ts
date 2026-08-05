import * as vscode from "vscode";
import type { WorktreeItem, WorktreesProvider } from "../modules/worktrees/provider.js";
import type { BranchNode, BranchesProvider } from "../modules/branches/provider.js";
import type { CommitItem, CommitsProvider } from "../modules/commits/provider.js";
import type { ScmTabState } from "./scmTabs.js";

export type ScmTreeNode = WorktreeItem | BranchNode | CommitItem;

/**
 * Facade TreeDataProvider for the single consolidated SCM view.
 * Delegates to Worktrees / Branches / Commits providers based on {@link ScmTabState}.
 */
export class ScmGroupedProvider implements vscode.TreeDataProvider<ScmTreeNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ScmTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly unsubTab: () => void;

  constructor(
    private readonly tabState: ScmTabState,
    private readonly worktrees: WorktreesProvider,
    private readonly branches: BranchesProvider,
    private readonly commits: CommitsProvider,
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
      this._onDidChangeTreeData,
    );
  }

  getTreeItem(element: ScmTreeNode): vscode.TreeItem {
    // Providers return the element as the TreeItem.
    return element;
  }

  async getChildren(element?: ScmTreeNode): Promise<ScmTreeNode[]> {
    if (this.tabState.active === "worktrees") {
      if (element) return [];
      return this.worktrees.getChildren();
    }
    if (this.tabState.active === "commits") {
      if (element) return [];
      return this.commits.getChildren();
    }
    return this.branches.getChildren(element as BranchNode | undefined);
  }

  dispose(): void {
    this.unsubTab();
    for (const d of this.disposables) d.dispose();
  }
}
