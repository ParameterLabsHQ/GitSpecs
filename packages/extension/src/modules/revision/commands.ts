import * as vscode from "vscode";
import path from "node:path";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import {
  DEFAULT_HISTORY_LIMIT,
  formatHistoryPickLabel,
} from "../history/actions.js";
import {
  parseRevisionUri,
  toRevisionUri,
  revisionDocumentTitle,
  revisionDiffTitle,
  REVISION_SCHEME,
} from "./uri.js";

/** Context keys for editor-title enablement of prev/next. */
export const CTX_HAS_PREVIOUS = "gitspecs.revision.hasPrevious";
export const CTX_HAS_NEXT = "gitspecs.revision.hasNext";
export const CTX_IS_REVISION = "gitspecs.revision.isRevisionEditor";

const SEQUENCE_LIMIT = 500;

export function registerRevisionCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.revision.openAtRevision",
      run(async () => {
        await openAtRevisionPick(repos, log);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.revision.diffWithPrevious",
      run(async () => {
        await diffWithPrevious(repos, log);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.revision.diffWithWorking",
      run(async () => {
        await diffWithWorking(repos, log);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.revision.previous",
      run(async () => {
        await navigateRevision(repos, log, "previous");
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.revision.next",
      run(async () => {
        await navigateRevision(repos, log, "next");
      }),
    ),
  );

  // Keep prev/next enablement context in sync with the active editor.
  // Debounce: revisionNeighbors walks file history (up to 500 commits).
  let ctxTimer: ReturnType<typeof setTimeout> | undefined;
  let lastCtxKey: string | undefined;
  const updateCtx = () => {
    if (ctxTimer) clearTimeout(ctxTimer);
    ctxTimer = setTimeout(() => {
      ctxTimer = undefined;
      const nextKey = vscode.window.activeTextEditor?.document.uri.toString() ?? "";
      if (nextKey === lastCtxKey) return;
      lastCtxKey = nextKey;
      void refreshRevisionContext(repos);
    }, 100);
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateCtx),
    {
      dispose: () => {
        if (ctxTimer) clearTimeout(ctxTimer);
      },
    },
  );
  updateCtx();
}

/**
 * Open a file at a chosen history revision as a real `gitspecs:` document
 * (replaces untitled-editor previews).
 */
export async function openRevisionInEditor(
  root: string,
  filePath: string,
  rev: string,
  options?: { preview?: boolean },
): Promise<void> {
  const uri = toRevisionUri(root, filePath, rev);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, {
    preview: options?.preview ?? true,
    preserveFocus: false,
  });
  void vscode.window.setStatusBarMessage(
    `GitSpecs: ${revisionDocumentTitle(filePath, rev)}`,
    3000,
  );
}

/**
 * Open vscode.diff between two revision documents (or revision vs working tree).
 */
export async function openRevisionDiff(
  root: string,
  filePath: string,
  leftRev: string | "working",
  rightRev: string | "working",
): Promise<void> {
  const leftUri =
    leftRev === "working"
      ? workingTreeUri(root, filePath)
      : toRevisionUri(root, filePath, leftRev);
  const rightUri =
    rightRev === "working"
      ? workingTreeUri(root, filePath)
      : toRevisionUri(root, filePath, rightRev);

  const leftLabel = leftRev === "working" ? "Working Tree" : shortRev(leftRev);
  const rightLabel = rightRev === "working" ? "Working Tree" : shortRev(rightRev);
  const title = revisionDiffTitle(filePath, leftLabel, rightLabel);

  await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
    preview: true,
  });
}

async function openAtRevisionPick(repos: RepoContext, log: PlatformLog): Promise<void> {
  const target = resolveActiveFileTarget(repos);
  if (!target) {
    void vscode.window.showInformationMessage(
      "Open a file on disk (or a revision document) to pick a revision",
    );
    return;
  }

  const commits = await target.repo.history.file(target.filePath, {
    limit: DEFAULT_HISTORY_LIMIT,
  });
  if (commits.length === 0) {
    void vscode.window.showInformationMessage("No history for this file");
    return;
  }

  const pick = await vscode.window.showQuickPick(
    commits.map((c) => {
      const labels = formatHistoryPickLabel(c);
      return { ...labels, sha: c.sha };
    }),
    {
      title: "GitSpecs: Open at Revision",
      placeHolder: "Select a revision",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!pick) return;

  log.info(`Open at revision: ${target.filePath} @ ${pick.sha.slice(0, 7)}`);
  await openRevisionInEditor(target.repo.root, target.filePath, pick.sha);
}

async function diffWithPrevious(repos: RepoContext, log: PlatformLog): Promise<void> {
  const target = resolveActiveFileTarget(repos);
  if (!target) {
    void vscode.window.showInformationMessage(
      "Open a file or revision document to diff with previous",
    );
    return;
  }

  // Working tree: diff tip of file history against working copy.
  if (!target.rev) {
    const tip = (
      await target.repo.history.fileWithPaths(target.filePath, { limit: 1 })
    )[0];
    if (!tip) {
      void vscode.window.showInformationMessage("No previous revision for this file");
      return;
    }
    log.info(`Diff working with ${tip.sha.slice(0, 7)}: ${target.filePath}`);
    await openRevisionDiff(target.repo.root, target.filePath, tip.sha, "working");
    return;
  }

  const neighbors = await target.repo.history.revisionNeighbors(
    target.filePath,
    target.rev,
    { limit: SEQUENCE_LIMIT },
  );
  if (!neighbors.previous) {
    void vscode.window.showInformationMessage("No previous revision for this file");
    return;
  }

  const left = neighbors.previous;
  const rightSha = neighbors.current?.sha ?? target.rev;
  log.info(
    `Diff ${left.sha.slice(0, 7)} → ${rightSha.slice(0, 7)}: ${target.filePath}`,
  );
  await openRevisionDiff(target.repo.root, target.filePath, left.sha, rightSha);
}

async function diffWithWorking(repos: RepoContext, log: PlatformLog): Promise<void> {
  const target = resolveActiveFileTarget(repos);
  if (!target) {
    void vscode.window.showInformationMessage(
      "Open a file or revision document to diff with working tree",
    );
    return;
  }

  const rev = target.rev ?? "HEAD";
  if (!target.rev) {
    // Already on working tree — diff working vs HEAD tip for the file.
    const tip = (
      await target.repo.history.fileWithPaths(target.filePath, { limit: 1 })
    )[0];
    if (!tip) {
      void vscode.window.showInformationMessage("No committed revision for this file");
      return;
    }
    log.info(`Diff ${tip.sha.slice(0, 7)} → working: ${target.filePath}`);
    await openRevisionDiff(target.repo.root, target.filePath, tip.sha, "working");
    return;
  }

  log.info(`Diff ${shortRev(rev)} → working: ${target.filePath}`);
  await openRevisionDiff(target.repo.root, target.filePath, rev, "working");
}

async function navigateRevision(
  repos: RepoContext,
  log: PlatformLog,
  direction: "previous" | "next",
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage("No active editor");
    return;
  }
  const parts = parseRevisionUri(editor.document.uri);
  if (!parts) {
    void vscode.window.showInformationMessage(
      "Previous/Next revision works on GitSpecs revision documents",
    );
    return;
  }

  const repo =
    repos.allRepos.find((r) => r.root === parts.root) ?? repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  const neighbors = await repo.history.revisionNeighbors(parts.path, parts.rev, {
    limit: SEQUENCE_LIMIT,
  });
  const dest = direction === "previous" ? neighbors.previous : neighbors.next;
  if (!dest) {
    void vscode.window.showInformationMessage(
      direction === "previous" ? "No previous revision" : "No next revision",
    );
    return;
  }

  // Keep the URI path stable (tip / lookup path). Changing to pathAtRev after a
  // rename breaks forward navigation because `git log --follow -- oldname`
  // omits commits that only touched the new name. Content is still rename-aware
  // via showFile path resolution.
  log.info(
    `Revision ${direction}: ${parts.path} @ ${parts.rev.slice(0, 7)} → ${dest.sha.slice(0, 7)}`,
  );
  await openRevisionInEditor(repo.root, parts.path, dest.sha, { preview: true });
}

interface FileTarget {
  repo: NonNullable<RepoContext["currentRepo"]>;
  filePath: string;
  /** Set when the active editor is a gitspecs: revision document. */
  rev?: string;
}

function resolveActiveFileTarget(repos: RepoContext): FileTarget | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const uri = editor.document.uri;
  if (uri.scheme === REVISION_SCHEME) {
    const parts = parseRevisionUri(uri);
    if (!parts) return undefined;
    const repo =
      repos.allRepos.find((r) => r.root === parts.root) ?? repos.currentRepo;
    if (!repo) return undefined;
    return { repo, filePath: parts.path, rev: parts.rev };
  }

  if (uri.scheme !== "file") return undefined;
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  return { repo, filePath: uri.fsPath };
}

function workingTreeUri(root: string, filePath: string): vscode.Uri {
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }
  return vscode.Uri.file(path.join(root, filePath));
}

function shortRev(rev: string): string {
  return rev.length > 12 ? rev.slice(0, 7) : rev;
}

async function refreshRevisionContext(repos: RepoContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const parts = editor ? parseRevisionUri(editor.document.uri) : undefined;
  const isRevision = Boolean(parts);
  await vscode.commands.executeCommand("setContext", CTX_IS_REVISION, isRevision);

  if (!parts) {
    await vscode.commands.executeCommand("setContext", CTX_HAS_PREVIOUS, false);
    await vscode.commands.executeCommand("setContext", CTX_HAS_NEXT, false);
    return;
  }

  const repo =
    repos.allRepos.find((r) => r.root === parts.root) ?? repos.currentRepo;
  if (!repo) {
    await vscode.commands.executeCommand("setContext", CTX_HAS_PREVIOUS, false);
    await vscode.commands.executeCommand("setContext", CTX_HAS_NEXT, false);
    return;
  }

  try {
    const neighbors = await repo.history.revisionNeighbors(parts.path, parts.rev, {
      limit: SEQUENCE_LIMIT,
    });
    await vscode.commands.executeCommand(
      "setContext",
      CTX_HAS_PREVIOUS,
      Boolean(neighbors.previous),
    );
    await vscode.commands.executeCommand(
      "setContext",
      CTX_HAS_NEXT,
      Boolean(neighbors.next),
    );
  } catch {
    await vscode.commands.executeCommand("setContext", CTX_HAS_PREVIOUS, false);
    await vscode.commands.executeCommand("setContext", CTX_HAS_NEXT, false);
  }
}
