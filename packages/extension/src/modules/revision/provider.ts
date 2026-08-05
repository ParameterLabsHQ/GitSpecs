import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { parseRevisionUri, REVISION_SCHEME } from "./uri.js";

/**
 * Read-only content provider for `gitspecs:` revision documents.
 * Backed by `repo.history.showFile` (rename-aware).
 */
export class RevisionContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly repos: RepoContext,
    private readonly log: PlatformLog,
  ) {}

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    return this.load(uri);
  }

  private async load(uri: vscode.Uri): Promise<string> {
    const parts = parseRevisionUri(uri);
    if (!parts) {
      this.log.info(`Revision provider: unparseable URI ${uri.toString()}`);
      return "";
    }

    const repo =
      this.repos.allRepos.find((r) => r.root === parts.root) ?? this.repos.currentRepo;
    if (!repo) {
      return `// GitSpecs: no repository available for ${parts.path}\n`;
    }

    try {
      return await repo.history.showFile(parts.path, parts.rev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.info(
        `Revision provider: failed ${parts.path} @ ${parts.rev.slice(0, 7)}: ${msg}`,
      );
      return `// GitSpecs: could not load ${parts.path} @ ${parts.rev.slice(0, 7)}\n// ${msg}\n`;
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

/** Register the provider on the `gitspecs` scheme. */
export function registerRevisionContentProvider(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): RevisionContentProvider {
  const provider = new RevisionContentProvider(repos, log);
  context.subscriptions.push(
    provider,
    vscode.workspace.registerTextDocumentContentProvider(REVISION_SCHEME, provider),
  );
  return provider;
}
