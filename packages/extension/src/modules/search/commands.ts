import * as vscode from "vscode";
import type { HistoryCommit } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import { resolveCommitUrl } from "../history/actions.js";
import {
  DEFAULT_SEARCH_LIMIT,
  formatSearchPickLabel,
  normalizeSearchQuery,
  searchCommitActions,
} from "./format.js";

export function registerSearchCommands(
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
      "gitspecs.search.commits",
      run(async () => {
        await runCommitSearch(repos, log);
      }),
    ),
  );
}

async function runCommitSearch(repos: RepoContext, log: PlatformLog): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  const grep = await vscode.window.showInputBox({
    title: "GitSpecs: Search Commits",
    prompt: "Message contains (optional if author is set)",
    placeHolder: "commit message text",
    ignoreFocusOut: true,
  });
  // User cancelled first prompt
  if (grep === undefined) return;

  const author = await vscode.window.showInputBox({
    title: "GitSpecs: Search Commits",
    prompt: "Author contains (optional if message is set)",
    placeHolder: "author name or email",
    ignoreFocusOut: true,
  });
  if (author === undefined) return;

  const query = normalizeSearchQuery(grep, author);
  if (!query) {
    void vscode.window.showInformationMessage(
      "Enter a message and/or author to search commits",
    );
    return;
  }

  log.info(
    `Search commits: grep=${query.grep ?? ""} author=${query.author ?? ""}`,
  );
  const commits = await repo.history.search({
    grep: query.grep,
    author: query.author,
    limit: DEFAULT_SEARCH_LIMIT,
  });

  if (commits.length === 0) {
    void vscode.window.showInformationMessage("No commits matched the search");
    return;
  }

  await pickSearchCommitAndAct(repos, log, commits);
}

async function pickSearchCommitAndAct(
  repos: RepoContext,
  log: PlatformLog,
  commits: HistoryCommit[],
): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    commits.map((c) => {
      const labels = formatSearchPickLabel(c);
      return { ...labels, commit: c };
    }),
    {
      title: "GitSpecs Commit Search",
      placeHolder: `${commits.length} commit${commits.length === 1 ? "" : "s"} — select one`,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!pick) return;

  const commit = pick.commit;
  let commitUrlStr: string | undefined;
  const repo = repos.currentRepo;
  if (repo) {
    try {
      const remoteUrl = await repo.branches.getRemoteUrl("origin");
      commitUrlStr = resolveCommitUrl(remoteUrl, commit.sha);
    } catch {
      commitUrlStr = undefined;
    }
  }

  const actions = searchCommitActions(Boolean(commitUrlStr));
  const header = [commit.author, commit.sha.slice(0, 7), commit.subject]
    .filter(Boolean)
    .join(" • ");

  const actionPick = await vscode.window.showQuickPick(
    actions.map((a) => ({ label: a.label, id: a.id })),
    {
      title: "GitSpecs Commit Search",
      placeHolder: header,
    },
  );
  if (!actionPick) return;

  switch (actionPick.id) {
    case "copySha":
      await vscode.env.clipboard.writeText(commit.sha);
      void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
      log.info(`Search: copied ${commit.sha.slice(0, 7)}`);
      break;
    case "openCommitUrl":
      if (commitUrlStr) {
        await vscode.env.openExternal(vscode.Uri.parse(commitUrlStr));
      }
      break;
  }
}
