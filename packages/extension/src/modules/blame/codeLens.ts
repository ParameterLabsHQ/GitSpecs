import * as vscode from "vscode";
import * as path from "node:path";
import type { BlameLine } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import type { BlameCache } from "./cache.js";
import {
  formatCodeLensAuthors,
  formatCodeLensLastChange,
} from "./format.js";
import { toDetailPayload, type BlameDetailPayload } from "./detail.js";

function isUnderRepo(repoRoot: string, fsPath: string): boolean {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(fsPath);
  return abs === root || abs.startsWith(root + path.sep);
}

/**
 * File-level CodeLens: author count + last change from one blame pass.
 * Uses shared BlameCache; does not block the host on every keystroke (debounce via provider refresh).
 */
export class BlameCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private seq = 0;

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

    const mySeq = ++this.seq;
    try {
      const rows = await this.cache.get(repo, fsPath, String(document.version));
      if (token.isCancellationRequested || mySeq !== this.seq) return [];
      if (rows.length === 0) return [];

      const top = new vscode.Range(0, 0, 0, 0);
      const lenses: vscode.CodeLens[] = [];

      const authorsTitle = formatCodeLensAuthors(rows);
      if (authorsTitle) {
        // Payload: most recent commit for detail
        const latest = pickLatest(rows);
        lenses.push(
          new vscode.CodeLens(top, {
            title: authorsTitle,
            command: "gitspecs.blame.codeLensDetail",
            arguments: latest ? [toDetailPayload(latest)] : [],
            tooltip: "GitSpecs: file authors",
          }),
        );
      }

      const lastChange = formatCodeLensLastChange(rows);
      if (lastChange) {
        const latest = pickLatest(rows);
        lenses.push(
          new vscode.CodeLens(top, {
            title: lastChange,
            command: "gitspecs.blame.codeLensDetail",
            arguments: latest ? [toDetailPayload(latest)] : [],
            tooltip: "GitSpecs: last change",
          }),
        );
      }

      return lenses;
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

function pickLatest(rows: BlameLine[]): BlameLine | undefined {
  let latest: BlameLine | undefined;
  for (const r of rows) {
    if (!latest || (r.authorTime ?? 0) > (latest.authorTime ?? 0)) {
      latest = r;
    }
  }
  return latest;
}

/** Type-only export for tests that construct payloads. */
export type { BlameDetailPayload };
