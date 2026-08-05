import * as vscode from "vscode";
import * as path from "node:path";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import type { BlameCache } from "./cache.js";
import {
  buildFileCodeLensSpecs,
  shouldAcceptCodeLensResult,
} from "./codeLensBuild.js";

function isUnderRepo(repoRoot: string, fsPath: string): boolean {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(fsPath);
  return abs === root || abs.startsWith(root + path.sep);
}

/**
 * File-level CodeLens: author count + last change from one blame pass.
 * Uses shared BlameCache; does not block the host on every keystroke (debounce via provider refresh).
 *
 * Stale-async policy: CancellationToken + per-document version match only.
 * No provider-global sequence (that raced concurrent documents and dropped valid lenses).
 */
export class BlameCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repos: RepoContext,
    private readonly cache: BlameCache,
    private readonly log: PlatformLog,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("gitspecs.blame.codeLens")) {
          this._onDidChange.fire();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== "file") return;
        const repo = this.repos.currentRepo;
        if (repo) this.cache.invalidate(repo.root, e.document.uri.fsPath);
        this.scheduleRefresh();
      }),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      this.repos.onDidChange(() => {
        this.cache.clear();
        this._onDidChange.fire();
      }),
    );
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this._onDidChange.fire(), 400);
  }

  private codeLensEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("blame.codeLens", true);
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    if (!this.codeLensEnabled()) return [];
    if (document.uri.scheme !== "file" || document.isUntitled) return [];

    const repo = this.repos.currentRepo;
    if (!repo) return [];

    const fsPath = document.uri.fsPath;
    if (!isUnderRepo(repo.root, fsPath)) return [];

    // Capture per-document version only — never a global seq that races across files.
    const requestedVersion = document.version;
    try {
      const rows = await this.cache.get(repo, fsPath, String(requestedVersion));
      if (
        !shouldAcceptCodeLensResult({
          cancelled: token.isCancellationRequested,
          requestedVersion,
          currentVersion: document.version,
        })
      ) {
        return [];
      }

      const specs = buildFileCodeLensSpecs(rows);
      if (specs.length === 0) return [];

      const top = new vscode.Range(0, 0, 0, 0);
      return specs.map(
        (spec) =>
          new vscode.CodeLens(top, {
            title: spec.title,
            command: "gitspecs.blame.codeLensDetail",
            arguments: spec.payload ? [spec.payload] : [],
            tooltip: spec.tooltip,
          }),
      );
    } catch (err) {
      this.log.debug(
        `CodeLens blame failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this._onDidChange.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
