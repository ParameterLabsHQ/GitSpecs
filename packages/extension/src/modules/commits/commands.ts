import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { resolveRepoForItem } from "../../shell/repoTree.js";
import { resolveCommitUrl } from "../history/actions.js";
import type { CommitItem } from "./provider.js";
import { truncateSubject } from "./format.js";

export function registerCommitCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  refresh: RefreshBus,
  log: PlatformLog,
): void {
  /** Mutations that should refresh trees after success. */
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => refresh.fire(),
      onError: (err) => presentError(log, err),
    });

  /** Read-only / clipboard / open URL — no tree refresh. */
  const runQuiet = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.commits.refresh",
      run(async () => {}),
    ),

    vscode.commands.registerCommand(
      "gitspecs.commits.copySha",
      runQuiet(async (item?: CommitItem) => {
        const sha = item?.commit.sha;
        if (!sha) {
          void vscode.window.showInformationMessage("Select a commit to copy its SHA");
          return;
        }
        await vscode.env.clipboard.writeText(sha);
        void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.commits.checkout",
      run(async (item?: CommitItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository selected");
          return;
        }
        const sha = item?.commit.sha;
        if (!sha) {
          void vscode.window.showInformationMessage("Select a commit to check out");
          return;
        }
        const short = sha.slice(0, 7);
        const subject = truncateSubject(item?.commit.subject ?? "");
        const detail = subject ? ` (“${subject}”)` : "";
        const confirm = await vscode.window.showWarningMessage(
          `Check out ${short}${detail} in detached HEAD?`,
          { modal: true },
          "Checkout",
        );
        if (confirm !== "Checkout") return;
        await repo.branches.checkout({ commit: sha });
        void vscode.window.setStatusBarMessage(`GitSpecs: detached at ${short}`, 3000);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.commits.createBranch",
      run(async (item?: CommitItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository selected");
          return;
        }
        const sha = item?.commit.sha;
        if (!sha) {
          void vscode.window.showInformationMessage(
            "Select a commit to create a branch from",
          );
          return;
        }
        const name = await vscode.window.showInputBox({
          title: "New branch name",
          prompt: `Create branch from ${sha.slice(0, 7)}`,
          placeHolder: "feature/from-commit",
          ignoreFocusOut: true,
        });
        if (!name?.trim()) return;
        const branchName = name.trim();
        await repo.branches.createFromCommit({ name: branchName, commit: sha });
        void vscode.window.showInformationMessage(
          `Created branch “${branchName}” at ${sha.slice(0, 7)}`,
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.commits.openRemote",
      runQuiet(async (item?: CommitItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository selected");
          return;
        }
        const sha = item?.commit.sha;
        if (!sha) {
          void vscode.window.showInformationMessage("Select a commit to open on remote");
          return;
        }
        let remoteUrl: string | undefined;
        try {
          remoteUrl = await repo.branches.getRemoteUrl("origin");
        } catch {
          remoteUrl = undefined;
        }
        // Reuse history helper (same host-urls path as file/line history).
        const url = resolveCommitUrl(remoteUrl, sha);
        if (!url) {
          void vscode.window.showInformationMessage(
            "Could not build a commit URL for the origin remote",
          );
          return;
        }
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }),
    ),
  );
}
