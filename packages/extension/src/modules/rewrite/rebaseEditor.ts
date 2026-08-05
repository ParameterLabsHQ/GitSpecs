import * as vscode from "vscode";
import {
  parseRebaseTodo,
  serializeRebaseTodo,
  type RebaseTodoEntry,
} from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { createGitSpecsWebview } from "../../shell/webviewHost.js";
import {
  isRebaseClientMessage,
  type RebaseRowDto,
  type RebaseAction,
} from "../../webviews/rebase/protocol.js";

/**
 * Open the sequence editor webview for a todo body, return serialized result
 * or undefined if cancelled.
 */
export async function editRebaseTodoInteractive(
  context: vscode.ExtensionContext,
  onto: string,
  todoText: string,
  log: PlatformLog,
): Promise<string | undefined> {
  const entries = parseRebaseTodo(todoText);
  const rows = entriesToDto(entries);

  return new Promise((resolve) => {
    const wv = createGitSpecsWebview({
      viewType: "gitspecs.rebaseEditor",
      title: "GitSpecs Interactive Rebase",
      scriptName: "rebase",
      extensionUri: context.extensionUri,
      retainContextWhenHidden: true,
    });

    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      wv.dispose();
      resolve(value);
    };

    wv.panel.onDidDispose(() => finish(undefined));

    wv.panel.webview.onDidReceiveMessage((raw: unknown) => {
      if (!isRebaseClientMessage(raw)) return;
      if (raw.type === "rebase:ready") {
        void wv.postMessage({
          type: "rebase:load",
          payload: { rows, onto },
        });
        return;
      }
      if (raw.type === "rebase:abort") {
        finish(undefined);
        return;
      }
      if (raw.type === "rebase:apply") {
        try {
          const next = dtoToEntries(raw.payload.rows, entries);
          const text = serializeRebaseTodo(next);
          log.info(`Rebase sequence apply (${raw.payload.rows.length} rows)`);
          finish(text);
        } catch (err) {
          void vscode.window.showErrorMessage(
            `Invalid sequence: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  });
}

/**
 * Start interactive rebase onto a ref: preview graph slice, open editor with a
 * synthetic todo from recent commits, then run git with replacementTodo.
 *
 * For true in-flight `git-rebase-todo` files, use {@link openRebaseTodoDocument}.
 */
export async function startInteractiveRebase(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  const onto = await vscode.window.showInputBox({
    title: "Interactive rebase onto",
    prompt: "Base ref (branch, tag, or SHA)",
    placeHolder: "main",
    ignoreFocusOut: true,
  });
  if (!onto?.trim()) return;

  // Build todo from onto..HEAD (oldest-first), matching git's interactive list.
  const rangeLog = await repo.exec([
    "log",
    "--reverse",
    "--format=%H%x00%s",
    `${onto.trim()}..HEAD`,
  ]);
  const todoLines = rangeLog.stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\0");
      if (!sha) return "";
      return `pick ${sha} ${subject ?? ""}`.trimEnd();
    })
    .filter(Boolean)
    .join("\n");
  if (!todoLines) {
    void vscode.window.showInformationMessage(
      `No commits to rebase onto ${onto.trim()} (already up to date?)`,
    );
    return;
  }
  const preview = `# GitSpecs interactive rebase onto ${onto.trim()}\n${todoLines}\n`;

  const replacement = await editRebaseTodoInteractive(
    context,
    onto.trim(),
    preview,
    log,
  );
  if (replacement == null) {
    void vscode.window.setStatusBarMessage("GitSpecs: interactive rebase cancelled", 2500);
    return;
  }

  await repo.rewrite.interactiveRebase({
    onto: onto.trim(),
    replacementTodo: replacement,
    requireClean: true,
  });
  void vscode.window.showInformationMessage("GitSpecs: interactive rebase finished");
  log.info(`Interactive rebase onto ${onto.trim()} completed`);
}

/**
 * Open / re-save a real `git-rebase-todo` document via the sequence editor.
 * Used when the user opens the file from a terminal-driven rebase.
 */
export async function openRebaseTodoDocument(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  log: PlatformLog,
): Promise<void> {
  const text = document.getText();
  const replacement = await editRebaseTodoInteractive(
    context,
    "(in progress)",
    text,
    log,
  );
  if (replacement == null) return;
  const edit = new vscode.WorkspaceEdit();
  const full = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  edit.replace(document.uri, full, replacement);
  await vscode.workspace.applyEdit(edit);
  await document.save();
  log.info("Updated git-rebase-todo via sequence editor");
}

function entriesToDto(entries: RebaseTodoEntry[]): RebaseRowDto[] {
  return entries.map((e) => ({
    action: (e.isComment ? "pick" : e.action) as RebaseAction,
    sha: e.sha,
    subject: e.rest || e.raw,
    isComment: e.isComment,
    raw: e.raw,
  }));
}

function dtoToEntries(rows: RebaseRowDto[], original: RebaseTodoEntry[]): RebaseTodoEntry[] {
  // Prefer UI row order/actions; fall back to original for comments
  return rows.map((r, i) => {
    if (r.isComment) {
      return original[i]?.isComment
        ? original[i]!
        : { action: "pick" as const, rest: "", isComment: true, raw: r.raw };
    }
    return {
      action: r.action,
      sha: r.sha,
      rest: r.subject,
      isComment: false,
      raw: r.raw,
    };
  });
}
