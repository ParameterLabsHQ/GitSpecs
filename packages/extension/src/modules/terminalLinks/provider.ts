import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { findShaLinks, findRefLinks, mergeTerminalHits } from "./match.js";

interface LinkData {
  kind: "sha" | "ref";
  sha?: string;
  ref?: string;
  text: string;
}

class GitSpecsTerminalLink extends vscode.TerminalLink {
  constructor(
    startIndex: number,
    length: number,
    tooltip: string,
    readonly data: LinkData,
  ) {
    super(startIndex, length, tooltip);
  }
}

/**
 * Terminal links for commit SHAs and known branch/tag names.
 */
export class GitSpecsTerminalLinkProvider
  implements vscode.TerminalLinkProvider<GitSpecsTerminalLink>, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];
  /** Cached short list of recent SHAs + refs for matching. */
  private cache:
    | { root: string; shas: string[]; refs: string[]; loadedAt: number }
    | undefined;
  private static readonly CACHE_MS = 30_000;

  constructor(
    private readonly repos: RepoContext,
    private readonly log: PlatformLog,
  ) {
    this.disposables.push(
      this.repos.onDidChange(() => {
        this.cache = undefined;
      }),
    );
  }

  private enabled(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("terminalLinks", true);
  }

  async provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    token: vscode.CancellationToken,
  ): Promise<GitSpecsTerminalLink[]> {
    if (!this.enabled()) return [];
    const line = context.line;
    if (!line?.trim()) return [];

    const catalog = await this.loadCatalog();
    if (token.isCancellationRequested) return [];

    const shaHits = findShaLinks(line, catalog.shas);
    const refHits = findRefLinks(line, catalog.refs);
    const merged = mergeTerminalHits(shaHits, refHits);

    return merged.map((h) => {
      if (h.kind === "sha") {
        return new GitSpecsTerminalLink(
          h.startIndex,
          h.length,
          `GitSpecs: commit ${h.text}`,
          { kind: "sha", sha: h.sha ?? h.text, text: h.text },
        );
      }
      return new GitSpecsTerminalLink(
        h.startIndex,
        h.length,
        `GitSpecs: ref ${h.text}`,
        { kind: "ref", ref: h.ref ?? h.text, text: h.text },
      );
    });
  }

  async handleTerminalLink(link: GitSpecsTerminalLink): Promise<void> {
    const actions: vscode.QuickPickItem[] = [
      { label: "Copy", description: link.data.text },
    ];
    if (link.data.kind === "sha") {
      actions.unshift(
        { label: "Copy SHA", description: link.data.sha },
        { label: "Show in Output", description: link.data.sha?.slice(0, 7) },
      );
    } else {
      actions.unshift(
        { label: "Checkout", description: link.data.ref },
        { label: "Copy name", description: link.data.ref },
      );
    }

    const pick = await vscode.window.showQuickPick(actions, {
      title: "GitSpecs Terminal Link",
      placeHolder: link.data.text,
    });
    if (!pick) return;

    const repo = this.repos.currentRepo;
    if (pick.label === "Copy" || pick.label === "Copy SHA" || pick.label === "Copy name") {
      const text =
        pick.label === "Copy SHA"
          ? (link.data.sha ?? link.data.text)
          : pick.label === "Copy name"
            ? (link.data.ref ?? link.data.text)
            : link.data.text;
      await vscode.env.clipboard.writeText(text);
      void vscode.window.setStatusBarMessage("GitSpecs: copied", 2000);
      return;
    }

    if (pick.label === "Show in Output" && link.data.sha) {
      this.log.info(`Terminal link commit ${link.data.sha}`);
      void vscode.window.showInformationMessage(
        `GitSpecs commit ${link.data.sha.slice(0, 7)} (see Output → GitSpecs)`,
      );
      return;
    }

    if (pick.label === "Checkout" && link.data.ref && repo) {
      try {
        await repo.branches.checkout({ name: link.data.ref });
        void vscode.window.setStatusBarMessage(
          `GitSpecs: checked out ${link.data.ref}`,
          3000,
        );
      } catch (err) {
        // Try as commit / detach
        try {
          await repo.branches.checkout({ commit: link.data.ref });
        } catch {
          void vscode.window.showErrorMessage(
            `GitSpecs: checkout failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  private async loadCatalog(): Promise<{ shas: string[]; refs: string[] }> {
    const repo = this.repos.currentRepo;
    if (!repo) return { shas: [], refs: [] };
    const now = Date.now();
    if (
      this.cache &&
      this.cache.root === repo.root &&
      now - this.cache.loadedAt < GitSpecsTerminalLinkProvider.CACHE_MS
    ) {
      return { shas: this.cache.shas, refs: this.cache.refs };
    }

    try {
      const [recent, branches, tags] = await Promise.all([
        repo.history.recent({ limit: 200 }),
        repo.branches.list({ includeRemotes: true }),
        repo.tags.list(),
      ]);
      const shas = recent.map((c) => c.sha);
      const refs = [
        ...branches.map((b) => b.name),
        ...tags.map((t) => t.name),
      ];
      this.cache = { root: repo.root, shas, refs, loadedAt: now };
      return { shas, refs };
    } catch (err) {
      this.log.debug(
        `Terminal link catalog failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { shas: [], refs: [] };
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

export function registerTerminalLinks(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): void {
  const provider = new GitSpecsTerminalLinkProvider(repos, log);
  context.subscriptions.push(
    provider,
    vscode.window.registerTerminalLinkProvider(provider),
  );
}
