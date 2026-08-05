import * as vscode from "vscode";
import {
  discoverRepos,
  findGit,
  openRepository,
  type GitBinary,
  type GitRepository,
} from "@gitplatform/git-core";
import type { PlatformLog } from "./log.js";

export class RepoContext implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private git: GitBinary | undefined;
  private repos: GitRepository[] = [];
  private current: GitRepository | undefined;
  private disposed = false;

  constructor(private readonly log: PlatformLog) {}

  get currentRepo(): GitRepository | undefined {
    return this.current;
  }

  get allRepos(): readonly GitRepository[] {
    return this.repos;
  }

  get gitBinary(): GitBinary | undefined {
    return this.git;
  }

  async initialize(): Promise<void> {
    const pathOverride =
      vscode.workspace.getConfiguration("gitPlatform").get<string>("git.path")?.trim() ||
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
    this._onDidChange.fire();
  }

  async setCurrent(root: string): Promise<void> {
    const found = this.repos.find((r) => r.root === root);
    if (found) {
      this.current = found;
      this._onDidChange.fire();
    }
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
