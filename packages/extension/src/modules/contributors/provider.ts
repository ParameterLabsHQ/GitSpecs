import * as vscode from "vscode";
import type { ContributorInfo, GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { presentError } from "../../shell/errors.js";
import type { PlatformLog } from "../../shell/log.js";
import { DEFAULT_CONTRIBUTORS_LIMIT, formatContributorTreeRow } from "./format.js";
import { RepoRootItem, shouldGroupByRepo } from "../../shell/repoTree.js";
import { GitHubClient } from "@gitspecs/host-api";

export type ContributorNode = RepoRootItem | ContributorItem;

export class ContributorItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(
    readonly contributor: ContributorInfo,
    repoRoot: string,
    options?: { avatarUrl?: string },
  ) {
    const row = formatContributorTreeRow(contributor);
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repoRoot;
    this.contextValue = "contributor";
    this.description = row.description;
    this.tooltip = row.tooltip;
    // Provider avatar URL when known (P21); no third-party CDN.
    if (options?.avatarUrl) {
      try {
        this.iconPath = vscode.Uri.parse(options.avatarUrl);
      } catch {
        this.iconPath = new vscode.ThemeIcon("person");
      }
    } else {
      this.iconPath = new vscode.ThemeIcon("person");
    }
  }
}

export class ContributorsProvider
  implements vscode.TreeDataProvider<ContributorNode>, vscode.Disposable
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

  getTreeItem(element: ContributorNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContributorNode): Promise<ContributorNode[]> {
    if (element instanceof ContributorItem) return [];
    if (element instanceof RepoRootItem) {
      const repo = this.repos.repoByRoot(element.repoRoot);
      if (!repo) return [];
      return this.listContributors(repo);
    }

    const all = this.repos.allRepos;
    if (all.length === 0) return [];
    if (shouldGroupByRepo(all.length)) {
      const current = this.repos.currentRepo?.root;
      return all.map((r) => new RepoRootItem(r, r.root === current));
    }
    return this.listContributors(all[0]!);
  }

  private async listContributors(repo: GitRepository): Promise<ContributorItem[]> {
    try {
      const list = await repo.contributors.list({ limit: DEFAULT_CONTRIBUTORS_LIMIT });
      // Best-effort GitHub avatar URLs from author name/email login heuristics.
      const gh = new GitHubClient();
      return list.map((c) => {
        const loginGuess = guessGithubLogin(c.email, c.name);
        const avatarUrl = loginGuess ? gh.avatarUrl(loginGuess) : undefined;
        return new ContributorItem(c, repo.root, { avatarUrl });
      });
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

/** Prefer email local-part when it looks like a GH noreply login. */
function guessGithubLogin(email?: string, name?: string): string | undefined {
  if (email) {
    const m = email.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/i);
    if (m?.[2]) return m[2];
    const local = email.split("@")[0]?.trim();
    if (local && /^[a-zA-Z0-9-]{1,39}$/.test(local)) return local;
  }
  if (name && /^[a-zA-Z0-9-]{1,39}$/.test(name.trim())) return name.trim();
  return undefined;
}
