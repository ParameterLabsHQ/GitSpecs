import * as vscode from "vscode";
import type { GraphCommit } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_GRAPH_LIMIT, formatGraphTreeRow } from "./format.js";
import { readAutolinkRules } from "../autolinks/settings.js";

export class GraphItem extends vscode.TreeItem {
  constructor(readonly node: GraphCommit) {
    const row = formatGraphTreeRow(node, { autolinkRules: readAutolinkRules() });
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "graphCommit";
    this.description = row.description;
    this.tooltip = row.tooltip;
    this.iconPath = new vscode.ThemeIcon(
      node.parents.length > 1 ? "git-merge" : "git-commit",
    );
  }
}

export class GraphProvider implements vscode.TreeDataProvider<GraphItem>, vscode.Disposable {
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

  getTreeItem(element: GraphItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<GraphItem[]> {
    const repo = this.repos.currentRepo;
    if (!repo) return [];
    try {
      const nodes = await repo.graph.log({ limit: DEFAULT_GRAPH_LIMIT, all: true });
      return nodes.map((n) => new GraphItem(n));
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
