import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoContext } from "./repoContext.js";

export class RefreshBus implements vscode.Disposable {
  private readonly _onDidRefresh = new vscode.EventEmitter<void>();
  readonly onDidRefresh = this._onDidRefresh.event;

  private debounceTimer: NodeJS.Timeout | undefined;
  private watchers: fs.FSWatcher[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly repos: RepoContext) {
    this.disposables.push(
      this.repos.onDidChange(() => {
        this.rewatch();
        this.fireSoon();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.repos.refreshRepos();
      }),
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) this.fireSoon();
      }),
    );
    this.rewatch();
  }

  fire(): void {
    this._onDidRefresh.fire();
  }

  fireSoon(ms = 300): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this._onDidRefresh.fire();
    }, ms);
  }

  private rewatch(): void {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    for (const repo of this.repos.allRepos) {
      const gitDir = path.join(repo.root, ".git");
      try {
        const stat = fs.statSync(gitDir);
        const watchPath = stat.isDirectory() ? gitDir : repo.root;
        const watcher = fs.watch(watchPath, { recursive: true }, () => this.fireSoon(400));
        this.watchers.push(watcher);
      } catch {
        // ignore missing .git
      }
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const w of this.watchers) w.close();
    for (const d of this.disposables) d.dispose();
    this._onDidRefresh.dispose();
  }
}
