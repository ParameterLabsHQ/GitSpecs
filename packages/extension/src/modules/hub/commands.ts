import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import { HubIssueTreeItem, HubPrTreeItem, HubWipItem } from "./provider.js";
import { resolveHubRepo } from "./resolveRepo.js";

export { resolveHubRepo } from "./resolveRepo.js";

export function registerHubCommands(
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
    vscode.commands.registerCommand("gitspecs.hub.refresh", run(async () => {})),

    vscode.commands.registerCommand(
      "gitspecs.hub.open",
      runQuiet(async (item?: HubPrTreeItem | HubIssueTreeItem) => {
        const url =
          item instanceof HubPrTreeItem
            ? item.item.pr.url
            : item instanceof HubIssueTreeItem
              ? item.item.issue.url
              : undefined;
        if (!url) return;
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.hub.checkout",
      run(async (item?: HubPrTreeItem | HubWipItem) => {
        const repo = resolveHubRepo(repos, item);
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository for this hub item");
          return;
        }
        let branch: string | undefined;
        if (item instanceof HubPrTreeItem) {
          branch = item.item.pr.headRef;
        } else if (item instanceof HubWipItem) {
          branch = item.branch;
        }
        if (!branch) {
          void vscode.window.showInformationMessage(
            "No branch on this hub item (PR may lack head ref)",
          );
          return;
        }
        await repo.branches.checkout({ name: branch });
        void vscode.window.setStatusBarMessage(`GitSpecs: checked out ${branch}`, 2500);
        log.info(`Hub checkout ${branch} in ${repo.root}`);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.hub.createWorktree",
      run(async (item?: HubPrTreeItem) => {
        const repo = resolveHubRepo(repos, item);
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository for this hub item");
          return;
        }
        const branch = item instanceof HubPrTreeItem ? item.item.pr.headRef : undefined;
        if (!branch) {
          void vscode.window.showInformationMessage(
            "Select a PR with a head branch (review-requested PRs are enriched with head.ref)",
          );
          return;
        }
        const path = await vscode.window.showInputBox({
          title: "Worktree path",
          value: `${repo.root.replace(/[/\\]$/, "")}-${branch.replace(/\//g, "-")}`,
          ignoreFocusOut: true,
        });
        if (!path?.trim()) return;
        await repo.worktrees.add({
          path: path.trim(),
          branch,
        });
        void vscode.window.showInformationMessage(`Worktree created at ${path.trim()}`);
        log.info(`Hub worktree ${branch} → ${path.trim()} (${repo.root})`);
      }),
    ),
  );
}
