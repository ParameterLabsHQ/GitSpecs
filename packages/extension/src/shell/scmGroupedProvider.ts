import * as vscode from "vscode";
import type { WorktreeItem, WorktreesProvider } from "../modules/worktrees/provider.js";
import type { BranchNode, BranchesProvider } from "../modules/branches/provider.js";
import type { ScmTabState } from "./scmTabs.js";

export type ScmTreeNode = WorktreeItem | BranchNode;

/**
 * Facade TreeDataProvider for the single consolidated SCM view.
 * Delegates to WorktreesProvider or BranchesProvider based on {@link ScmTabState}.
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
  ) {
    this.unsubTab = tabState.onDidChange(() => this._onDidChangeTreeData.fire());
    this.disposables.push(
      worktrees.onDidChangeTreeData(() => {
        if (this.tabState.active === "worktrees") this._onDidChangeTreeData.fire();
      }),
      branches.onDidChangeTreeData(() => {
        if (this.tabState.active === "branches") this._onDidChangeTreeData.fire();
      }),
      this._onDidChangeTreeData,
    );
  }

  getTreeItem(element: ScmTreeNode): vscode.TreeItem {
    // Both providers return the element as the TreeItem.
    return element;
  }

  async getChildren(element?: ScmTreeNode): Promise<ScmTreeNode[]> {
    if (this.tabState.active === "worktrees") {
      if (element) return [];
      return this.worktrees.getChildren();
    }
    return this.branches.getChildren(element as BranchNode | undefined);
  }

  dispose(): void {
    this.unsubTab();
    for (const d of this.disposables) d.dispose();
  }
}
