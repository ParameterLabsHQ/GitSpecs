import * as vscode from "vscode";
import path from "node:path";
import type { HistoryCommit } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import {
  DEFAULT_HISTORY_LIMIT,
  formatHistoryPickLabel,
  historyCommitActions,
  resolveCommitUrl,
  toHistoryCommitItem,
  type HistoryCommitItem,
} from "./actions.js";

function isDiskFile(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file";
}

export function registerHistoryCommands(
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
      "gitspecs.history.file",
      run(async () => {
        await showFileHistory(repos, log);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.history.line",
      run(async () => {
        await showLineHistory(repos, log);
      }),
    ),
  );
}

async function showFileHistory(repos: RepoContext, log: PlatformLog): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isDiskFile(editor.document)) {
    void vscode.window.showInformationMessage("Open a file on disk to show history");
    return;
  }
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  const filePath = editor.document.uri.fsPath;
  log.info(`File history: ${filePath}`);
  const commits = await repo.history.file(filePath, { limit: DEFAULT_HISTORY_LIMIT });
  if (commits.length === 0) {
    void vscode.window.showInformationMessage("No history for this file");
    return;
  }

  await pickCommitAndAct(repos, log, commits, filePath, "GitSpecs File History");
}

async function showLineHistory(repos: RepoContext, log: PlatformLog): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isDiskFile(editor.document)) {
    void vscode.window.showInformationMessage(
      "Open a file on disk to show line history",
    );
    return;
  }
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const sel = editor.selection;
  // VS Code lines are 0-based; git log -L is 1-based inclusive.
  let startLine = sel.start.line + 1;
  let endLine = sel.end.line + 1;
  // Empty selection (cursor only): history for the current line.
  // If selection ends at column 0 of a line, treat end as previous line
  // (common when selecting whole lines with Shift+Down).
  if (sel.isEmpty) {
    endLine = startLine;
  } else if (sel.end.character === 0 && endLine > startLine) {
    endLine = endLine - 1;
  }

  log.info(`Line history: ${filePath} L${startLine}-${endLine}`);
  const commits = await repo.history.line(filePath, {
    startLine,
    endLine,
    limit: DEFAULT_HISTORY_LIMIT,
  });
  if (commits.length === 0) {
    void vscode.window.showInformationMessage("No line history for this selection");
    return;
  }

  const title =
    startLine === endLine
      ? `GitSpecs Line History (L${startLine})`
      : `GitSpecs Line History (L${startLine}–${endLine})`;
  await pickCommitAndAct(repos, log, commits, filePath, title);
}

async function pickCommitAndAct(
  repos: RepoContext,
  log: PlatformLog,
  commits: HistoryCommit[],
  filePath: string,
  title: string,
): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    commits.map((c) => {
      const labels = formatHistoryPickLabel(c);
      return {
        ...labels,
        commit: c,
      };
    }),
    {
      title,
      placeHolder: "Select a commit",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!pick) return;

  const item = toHistoryCommitItem(pick.commit, filePath);
  await runHistoryActions(repos, log, item);
}

async function runHistoryActions(
  repos: RepoContext,
  log: PlatformLog,
  item: HistoryCommitItem,
): Promise<void> {
  const repo = repos.currentRepo;
  let commitUrlStr: string | undefined;
  if (repo) {
    try {
      const remoteUrl = await repo.branches.getRemoteUrl("origin");
      commitUrlStr = resolveCommitUrl(remoteUrl, item.sha);
    } catch {
      commitUrlStr = undefined;
    }
  }

  const actions = historyCommitActions(Boolean(commitUrlStr));
  const header = [item.author, item.sha.slice(0, 7), item.subject]
    .filter(Boolean)
    .join(" • ");

  const actionPick = await vscode.window.showQuickPick(
    actions.map((a) => ({ label: a.label, id: a.id })),
    {
      title: "GitSpecs History",
      placeHolder: header,
    },
  );
  if (!actionPick) return;

  switch (actionPick.id) {
    case "copySha":
      await vscode.env.clipboard.writeText(item.sha);
      void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
      break;
    case "openCommitUrl":
      if (commitUrlStr) {
        await vscode.env.openExternal(vscode.Uri.parse(commitUrlStr));
      }
      break;
    case "viewAtRev":
      await viewFileAtRevision(repos, log, item);
      break;
  }
}

async function viewFileAtRevision(
  repos: RepoContext,
  log: PlatformLog,
  item: HistoryCommitItem,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }
  try {
    const content = await repo.history.showFile(item.filePath, item.sha);
    const base = path.basename(item.filePath);
    const short = item.sha.slice(0, 7);
    const doc = await vscode.workspace.openTextDocument({
      content,
      language: guessLanguage(base),
    });
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
    void vscode.window.setStatusBarMessage(
      `GitSpecs: ${base} @ ${short}`,
      3000,
    );
    log.info(`View ${item.filePath} @ ${item.sha.slice(0, 7)}`);
  } catch (err) {
    await presentError(log, err, "View file at revision");
  }
}

/** Best-effort language id from filename for untitled preview docs. */
function guessLanguage(fileName: string): string | undefined {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".css": "css",
    ".html": "html",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".sh": "shellscript",
    ".txt": "plaintext",
  };
  return map[ext];
}
