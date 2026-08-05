import * as vscode from "vscode";
import * as path from "node:path";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import type { WorktreeItem } from "./provider.js";
import {
  existingWorktreeBranchNames,
  worktreeBranchRefFromPick,
} from "./branchPick.js";

function confirmDeletes(): boolean {
  return vscode.workspace.getConfiguration("gitspecs").get<boolean>("confirmDelete", true);
}

function pathTemplate(repoName: string, branch: string): string {
  const tpl = vscode.workspace
    .getConfiguration("gitspecs")
    .get<string>("worktrees.pathTemplate", "${repoName}-${branch}");
  return tpl.replace(/\$\{repoName\}/g, repoName).replace(/\$\{branch\}/g, branch.replace(/\//g, "-"));
}

export function registerWorktreeCommands(
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.worktrees.refresh",
      run(async () => {
        /* refresh bus */
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.create",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository selected.");
          return;
        }

        const mode = await vscode.window.showQuickPick(
          [
            { label: "Existing branch", value: "existing" as const },
            { label: "New branch from ref", value: "new" as const },
          ],
          { title: "Create worktree" },
        );
        if (!mode) return;

        const branches = await repo.branches.list({ includeRemotes: true });
        const branchNames = existingWorktreeBranchNames(branches);

        let branch: string | undefined;
        let createBranch = false;
        let startPoint: string | undefined;

        if (mode.value === "existing") {
          const pick = await vscode.window.showQuickPick(branchNames, {
            title: "Branch to check out in worktree",
          });
          if (!pick) return;
          branch = worktreeBranchRefFromPick(pick);
        } else {
          branch = await vscode.window.showInputBox({
            title: "New branch name",
            prompt: "Name for the new branch",
          });
          if (!branch) return;
          startPoint =
            (await vscode.window.showQuickPick(["main", "master", "HEAD", ...branchNames], {
              title: "Start point (ref)",
            })) ?? "HEAD";
          createBranch = true;
        }

        const repoName = path.basename(repo.root);
        const baseSetting = vscode.workspace
          .getConfiguration("gitspecs")
          .get<string>("worktrees.defaultLocation", "")
          .trim();
        const base = baseSetting || path.dirname(repo.root);
        const defaultPath = path.join(base, pathTemplate(repoName, branch ?? "branch"));

        const targetPath = await vscode.window.showInputBox({
          title: "Worktree path",
          value: defaultPath,
        });
        if (!targetPath) return;

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Creating worktree…" },
          async () => {
            await repo.worktrees.add({
              path: targetPath,
              branch,
              createBranch,
              startPoint: createBranch ? startPoint : undefined,
            });
          },
        );

        const openNew = vscode.workspace
          .getConfiguration("gitspecs")
          .get<boolean>("worktrees.openInNewWindow", true);
        const choice = await vscode.window.showInformationMessage(
          `Worktree created at ${targetPath}`,
          openNew ? "Open New Window" : "Open Current Window",
          openNew ? "Open Current Window" : "Open New Window",
          "Dismiss",
        );
        if (choice === "Open New Window") {
          await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetPath), true);
        } else if (choice === "Open Current Window") {
          await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(targetPath), false);
        }
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.openCurrentWindow",
      run(async (item?: WorktreeItem) => {
        const p = item?.info.path ?? (await pickWorktreePath(repos));
        if (!p) return;
        await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(p), false);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.openNewWindow",
      run(async (item?: WorktreeItem) => {
        const p = item?.info.path ?? (await pickWorktreePath(repos));
        if (!p) return;
        await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(p), true);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.reveal",
      run(async (item?: WorktreeItem) => {
        const p = item?.info.path ?? (await pickWorktreePath(repos));
        if (!p) return;
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(p));
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.copyPath",
      run(async (item?: WorktreeItem) => {
        const p = item?.info.path ?? (await pickWorktreePath(repos));
        if (!p) return;
        await vscode.env.clipboard.writeText(p);
        void vscode.window.showInformationMessage("Worktree path copied");
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.remove",
      run(async (item?: WorktreeItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const p = item?.info.path ?? (await pickWorktreePath(repos));
        if (!p) return;
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Remove worktree ${p}?`,
            { modal: true },
            "Remove",
          );
          if (ok !== "Remove") return;
        }
        try {
          await repo.worktrees.remove({ path: p });
        } catch {
          await repo.worktrees.remove({ path: p, force: true });
        }
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.worktrees.prune",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        await repo.worktrees.prune();
        void vscode.window.showInformationMessage("Pruned stale worktrees");
      }),
    ),
  );
}

async function pickWorktreePath(repos: RepoContext): Promise<string | undefined> {
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  const list = await repo.worktrees.list();
  const pick = await vscode.window.showQuickPick(
    list.map((w) => ({ label: path.basename(w.path), description: w.path, path: w.path })),
    { title: "Select worktree" },
  );
  return pick?.path;
}
