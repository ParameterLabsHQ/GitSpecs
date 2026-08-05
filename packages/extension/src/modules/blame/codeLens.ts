import * as vscode from "vscode";
import * as path from "node:path";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import type { BlameCache } from "./cache.js";
import {
  buildFileCodeLensSpecs,
  buildSymbolCodeLensSpecs,
  shouldAcceptCodeLensResult,
  topLevelSymbolRanges,
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

      const fileSpecs = buildFileCodeLensSpecs(rows);
      const symbolSpecs = await this.symbolSpecs(document, rows, token);
      if (
        !shouldAcceptCodeLensResult({
          cancelled: token.isCancellationRequested,
          requestedVersion,
          currentVersion: document.version,
        })
      ) {
        return [];
      }

      const specs = [...fileSpecs, ...symbolSpecs];
      if (specs.length === 0) return [];

      return specs.map((spec) => {
        const line = Math.max(0, Math.min(document.lineCount - 1, spec.line ?? 0));
        const range = new vscode.Range(line, 0, line, 0);
        return new vscode.CodeLens(range, {
          title: spec.title,
          command: "gitspecs.blame.codeLensDetail",
          arguments: spec.payload ? [spec.payload] : [],
          tooltip: spec.tooltip,
        });
      });
    } catch (err) {
      this.log.debug(
        `CodeLens blame failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /** Top-level document symbols → per-symbol author/last-change lenses. */
  private async symbolSpecs(
    document: vscode.TextDocument,
    rows: import("@gitspecs/git-core").BlameLine[],
    token: vscode.CancellationToken,
  ) {
    try {
      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined
      >("vscode.executeDocumentSymbolProvider", document.uri);
      if (token.isCancellationRequested || !symbols?.length) return [];

      // DocumentSymbol[] has ranges + children; SymbolInformation[] is flat with locations.
      const topLevel = isDocumentSymbolArray(symbols)
        ? topLevelSymbolRanges(symbols)
        : topLevelSymbolRanges(
            symbols.map((s) => ({
              name: s.name,
              range: s.location.range,
            })),
          );

      // Skip symbols that cover the entire file (file-level lenses already cover them).
      const filtered = topLevel.filter(
        (s) => !(s.startLine === 0 && s.endLine >= document.lineCount - 1),
      );
      return buildSymbolCodeLensSpecs(rows, filtered);
    } catch {
      return [];
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this._onDidChange.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

function isDocumentSymbolArray(
  symbols: vscode.DocumentSymbol[] | vscode.SymbolInformation[],
): symbols is vscode.DocumentSymbol[] {
  const first = symbols[0];
  return Boolean(first && "children" in first && "range" in first && !("location" in first));
}
