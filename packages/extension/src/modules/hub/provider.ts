import * as vscode from "vscode";
import { parseRemoteUrl } from "@gitspecs/host-urls";
import { GitHubClient } from "@gitspecs/host-api";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { getGitHubToken, hostingEnabled, githubApiBaseUrl } from "../hosting/auth.js";
import { aggregateHub, type HubGroups, type HubPrItem } from "./aggregate.js";

type HubNode = HubGroupItem | HubPrTreeItem | HubWipItem | vscode.TreeItem;

class HubGroupItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly children: HubNode[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "hubGroup";
  }
}

class HubPrTreeItem extends vscode.TreeItem {
  constructor(readonly item: HubPrItem) {
    super(`#${item.pr.number} ${item.pr.title}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${item.repoLabel} · ${item.reason}`;
    this.tooltip = item.pr.url;
    this.contextValue = "hubPr";
    this.iconPath = new vscode.ThemeIcon("git-pull-request");
    this.command = {
      command: "vscode.open",
      title: "Open PR",
      arguments: [vscode.Uri.parse(item.pr.url)],
    };
  }
}

class HubWipItem extends vscode.TreeItem {
  constructor(
    readonly branch: string,
    readonly repoLabel: string,
    ahead: number,
    behind: number,
  ) {
    super(branch, vscode.TreeItemCollapsibleState.None);
    this.description = `${repoLabel} · ↑${ahead} ↓${behind}`;
    this.contextValue = "hubWip";
    this.iconPath = new vscode.ThemeIcon("git-branch");
  }
}

export class HubProvider implements vscode.TreeDataProvider<HubNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];
  private cache: HubGroups | undefined;

  constructor(
    private readonly repos: RepoContext,
    refresh: RefreshBus,
    private readonly log: PlatformLog,
  ) {
    this.disposables.push(
      refresh.onDidRefresh(() => {
        this.cache = undefined;
        this._onDidChangeTreeData.fire();
      }),
      repos.onDidChange(() => {
        this.cache = undefined;
        this._onDidChangeTreeData.fire();
      }),
    );
  }

  getTreeItem(element: HubNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: HubNode): Promise<HubNode[]> {
    if (element instanceof HubGroupItem) return element.children;
    if (element) return [];

    if (!hostingEnabled()) {
      return [new vscode.TreeItem("Hosting disabled (gitspecs.hosting.enabled)")];
    }

    const groups = await this.load();
    const nodes: HubNode[] = [];
    if (groups.needsAction.length) {
      nodes.push(
        new HubGroupItem(
          "Needs your action",
          groups.needsAction.map((i) => new HubPrTreeItem(i)),
        ),
      );
    }
    if (groups.blocked.length) {
      nodes.push(
        new HubGroupItem(
          "Blocked / draft",
          groups.blocked.map((i) => new HubPrTreeItem(i)),
        ),
      );
    }
    if (groups.waiting.length) {
      nodes.push(
        new HubGroupItem(
          "Waiting on others",
          groups.waiting.map((i) => new HubPrTreeItem(i)),
        ),
      );
    }
    if (groups.wip.length) {
      nodes.push(
        new HubGroupItem(
          "WIP branches",
          groups.wip.map(
            (b) => new HubWipItem(b.name, b.repoLabel, b.ahead, b.behind),
          ),
        ),
      );
    }
    if (nodes.length === 0) {
      return [
        new vscode.TreeItem(
          "No hub items (sign in to GitHub or open multi-repo workspace)",
        ),
      ];
    }
    return nodes;
  }

  private async load(): Promise<HubGroups> {
    if (this.cache) return this.cache;
    const token = await getGitHubToken();
    const myOpenPrs: Array<import("@gitspecs/host-api").PullRequestSummary & { repoLabel: string }> =
      [];
    const reviewRequested: typeof myOpenPrs = [];
    const wipBranches: HubGroups["wip"] = [];

    for (const repo of this.repos.allRepos) {
      const label = repo.root.split(/[/\\]/).pop() ?? repo.root;
      try {
        const branches = await repo.branches.list({ includeRemotes: false });
        for (const b of branches) {
          if (!b.remote && (b.ahead > 0 || b.behind > 0)) {
            wipBranches.push({
              name: b.name,
              ahead: b.ahead,
              behind: b.behind,
              repoLabel: label,
            });
          }
        }
        if (!token) continue;
        const remoteUrl = await repo.branches.getRemoteUrl("origin").catch(() => undefined);
        const id = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
        if (!id || id.provider !== "github") continue;
        const client = new GitHubClient({ token, baseUrl: githubApiBaseUrl() });
        const prs = await client.listOpenPullRequests(id.owner, id.repo);
        for (const p of prs) {
          myOpenPrs.push({ ...p, repoLabel: label });
        }
      } catch (err) {
        this.log.debug(
          `Hub load ${label}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.cache = aggregateHub({ myOpenPrs, reviewRequested, wipBranches });
    return this.cache;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
