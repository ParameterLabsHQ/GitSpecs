import * as vscode from "vscode";
import {
  discoverRepos,
  findGit,
  openRepository,
  type GitBinary,
  type GitRepository,
} from "@gitspecs/git-core";
import type { PlatformLog } from "./log.js";
import { HAS_REPOSITORY_CONTEXT_KEY } from "./scmTabs.js";

export class RepoContext implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private git: GitBinary | undefined;
  private repos: GitRepository[] = [];
  private current: GitRepository | undefined;
  private disposed = false;
  /** Last value pushed to `setContext`; undefined until first sync. */
  private hasRepositoryContext: boolean | undefined;

  constructor(private readonly log: PlatformLog) {}

  get currentRepo(): GitRepository | undefined {
    return this.current;
  }

  get allRepos(): readonly GitRepository[] {
    return this.repos;
  }

  /** True when more than one repository is open (P17 multi-repo tree grouping). */
  get isMultiRepo(): boolean {
    return this.repos.length > 1;
  }

  /** Look up a repository by absolute root path. */
  repoByRoot(root: string): GitRepository | undefined {
    if (!root) return undefined;
    const normalized = root.replace(/\/+$/, "");
    return this.repos.find(
      (r) => r.root === root || r.root === normalized || r.root.replace(/\/+$/, "") === normalized,
    );
  }

  /** Best repository containing an absolute file path (longest root wins). */
  repoForPath(fsPath: string): GitRepository | undefined {
    if (!fsPath) return undefined;
    const abs = fsPath;
    let best: GitRepository | undefined;
    for (const r of this.repos) {
      if (abs === r.root || abs.startsWith(r.root + "/") || abs.startsWith(r.root + "\\")) {
        if (!best || r.root.length > best.root.length) best = r;
      }
    }
    return best;
  }

  get gitBinary(): GitBinary | undefined {
    return this.git;
  }

  async initialize(): Promise<void> {
    const pathOverride =
      vscode.workspace.getConfiguration("gitspecs").get<string>("git.path")?.trim() ||
      undefined;
    this.git = await findGit(pathOverride);
    this.log.info(`Using git ${this.git.version} at ${this.git.path}`);
    await this.refreshRepos();
  }

  async refreshRepos(): Promise<void> {
    if (!this.git) return;
    const folders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
    const roots = await discoverRepos(folders, this.git);
    const opened: GitRepository[] = [];
    for (const r of roots) {
      opened.push(await openRepository(r.root, this.git));
    }
    this.repos = opened;

    if (this.current && opened.some((r) => r.root === this.current!.root)) {
      this.current = opened.find((r) => r.root === this.current!.root);
    } else {
      this.current = await this.pickDefaultRepo(opened);
    }
    await this.syncHasRepositoryContext();
    this._onDidChange.fire();
  }

  async setCurrent(root: string): Promise<void> {
    const found = this.repos.find((r) => r.root === root);
    if (found) {
      this.current = found;
      this._onDidChange.fire();
    }
  }

  /** Keep `gitspecs.hasRepository` in sync for viewsWelcome `when` clauses. */
  private async syncHasRepositoryContext(): Promise<void> {
    const next = this.repos.length > 0;
    if (next === this.hasRepositoryContext) return;
    this.hasRepositoryContext = next;
    await vscode.commands.executeCommand("setContext", HAS_REPOSITORY_CONTEXT_KEY, next);
  }

  async switchRepositoryInteractive(): Promise<void> {
    if (this.repos.length === 0) {
      void vscode.window.showInformationMessage("No Git repositories in this workspace.");
      return;
    }
    const pick = await vscode.window.showQuickPick(
      this.repos.map((r) => ({
        label: r.root.split(/[/\\]/).pop() ?? r.root,
        description: r.root,
        root: r.root,
      })),
      { title: "Switch repository" },
    );
    if (pick) {
      await this.setCurrent(pick.root);
    }
  }

  private async pickDefaultRepo(repos: GitRepository[]): Promise<GitRepository | undefined> {
    if (repos.length === 0) return undefined;
    if (repos.length === 1) return repos[0];
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (active) {
      const match = repos.find((r) => active.startsWith(r.root));
      if (match) return match;
    }
    return repos[0];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._onDidChange.dispose();
  }
}
