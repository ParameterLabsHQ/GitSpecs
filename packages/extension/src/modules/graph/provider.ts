import * as vscode from "vscode";
import type { GraphCommit, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_GRAPH_LIMIT, formatGraphTreeRow } from "./format.js";
import { readAutolinkRules } from "../autolinks/settings.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";

export type GraphNode = RepoRootItem | GraphItem;

export class GraphItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly node: GraphCommit, repoRoot: string) {
    const row = formatGraphTreeRow(node, { autolinkRules: readAutolinkRules() });
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = "graphCommit";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon(
      node.parents.length > 1 ? "git-merge" : "git-commit",
    );
  }
}

export class GraphProvider implements vscode.TreeDataProvider<GraphNode>, vscode.Disposable {
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

  getTreeItem(element: GraphNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GraphNode): Promise<GraphNode[]> {
    if (element instanceof GraphItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listGraph(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listGraph(all[0]!);
  }

  private async listGraph(repo: GitRepository): Promise<GraphItem[]> {
    try {
      const nodes = await repo.graph.log({ limit: DEFAULT_GRAPH_LIMIT, all: true });
      return nodes.map((n) => new GraphItem(n, repo.root));
    } catch (err) {
      await presentError(this.log, err, "Commit Graph");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
