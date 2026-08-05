import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { resolveRepoForItem } from "../../shell/repoTree.js";
import { resolveCommitUrl } from "../history/actions.js";
import { runCompareInteractive } from "../compare/commands.js";
import type { GraphItem } from "./provider.js";

export function registerGraphCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  refresh: RefreshBus,
  log: PlatformLog,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => refresh.fire(),
      onError: (err) => presentError(log, err),
    });

  const runQuiet = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.graph.refresh", run(async () => {})),

    vscode.commands.registerCommand(
      "gitspecs.graph.copySha",
      runQuiet(async (item?: GraphItem) => {
        const sha = item?.node.sha;
        if (!sha) return;
        await vscode.env.clipboard.writeText(sha);
        void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.graph.checkout",
      run(async (item?: GraphItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo || !item?.node.sha) return;
        const short = item.node.sha.slice(0, 7);
        const ok = await vscode.window.showWarningMessage(
          `Check out ${short} in detached HEAD?`,
          { modal: true },
          "Checkout",
        );
        if (ok !== "Checkout") return;
        await repo.branches.checkout({ commit: item.node.sha });
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.graph.createBranch",
      run(async (item?: GraphItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo || !item?.node.sha) return;
        const name = await vscode.window.showInputBox({
          title: "New branch name",
          prompt: `Create branch from ${item.node.sha.slice(0, 7)}`,
          ignoreFocusOut: true,
        });
        if (!name?.trim()) return;
        await repo.branches.createFromCommit({
          name: name.trim(),
          commit: item.node.sha,
        });
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.graph.compare",
      runQuiet(async (item?: GraphItem) => {
        // Pre-fill head as the selected commit sha when provided.
        await runCompareInteractive(repos, log, item?.node.sha);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.graph.openRemote",
      runQuiet(async (item?: GraphItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo || !item?.node.sha) return;
        let remoteUrl: string | undefined;
        try {
          remoteUrl = await repo.branches.getRemoteUrl("origin");
        } catch {
          remoteUrl = undefined;
        }
        const url = resolveCommitUrl(remoteUrl, item.node.sha);
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
