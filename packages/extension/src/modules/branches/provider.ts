import * as vscode from "vscode";
import type { BranchInfo, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";

export type BranchNode = RepoRootItem | BranchGroupItem | BranchItem;

export class BranchGroupItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(
    label: string,
    readonly children: BranchItem[],
    repoRoot: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repoRoot;
    this.contextValue = "branchGroup";
  }
}

export class BranchItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly info: BranchInfo, repoRoot: string) {
    super(info.name, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = info.remote ? "branchRemote" : "branchLocal";
    const track: string[] = [];
    if (info.upstream) {
      track.push(info.upstream);
      if (info.ahead) track.push(`↑${info.ahead}`);
      if (info.behind) track.push(`↓${info.behind}`);
    }
    this.description = track.join(" ");
    this.iconPath = new vscode.ThemeIcon(info.current ? "circle-filled" : "git-branch");
    this.tooltip = info.refName;
  }
}

export class BranchesProvider implements vscode.TreeDataProvider<BranchNode>, vscode.Disposable {
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

  getTreeItem(element: BranchNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BranchNode): Promise<BranchNode[]> {
    if (element instanceof BranchGroupItem) {
      return element.children;
    }
    if (element instanceof BranchItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listBranchGroups(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listBranchGroups(all[0]!);
  }

  private async listBranchGroups(repo: GitRepository): Promise<BranchGroupItem[]> {
    try {
      const list = await repo.branches.list({ includeRemotes: true });
      const current = list.filter((b) => b.current);
      const local = list.filter((b) => !b.remote && !b.current && !b.detached);
      const remotes = list.filter((b) => b.remote);
      const root = repo.root;

      const groups: BranchGroupItem[] = [];
      if (current.length) {
        groups.push(
          new BranchGroupItem(
            "Current",
            current.map((b) => new BranchItem(b, root)),
            root,
          ),
        );
      }
      groups.push(
        new BranchGroupItem(
          "Local",
          local.map((b) => new BranchItem(b, root)),
          root,
        ),
      );

      const byRemote = new Map<string, BranchInfo[]>();
      for (const r of remotes) {
        const remoteName = r.name.includes("/") ? r.name.split("/")[0]! : "remote";
        const arr = byRemote.get(remoteName) ?? [];
        arr.push(r);
        byRemote.set(remoteName, arr);
      }
      for (const [remote, branches] of byRemote) {
        groups.push(
          new BranchGroupItem(
            `Remote: ${remote}`,
            branches.map((b) => new BranchItem(b, root)),
            root,
          ),
        );
      }
      return groups;
    } catch (err) {
      await presentError(this.log, err, "Branches");
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
