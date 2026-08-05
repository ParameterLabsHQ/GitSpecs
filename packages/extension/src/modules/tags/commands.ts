import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { resolveRepoForItem } from "../../shell/repoTree.js";
import type { TagItem } from "./provider.js";

function confirmDeletes(): boolean {
  return vscode.workspace.getConfiguration("gitspecs").get<boolean>("confirmDelete", true);
}

export function registerTagCommands(
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
    vscode.commands.registerCommand("gitspecs.tags.refresh", run(async () => {})),

    vscode.commands.registerCommand(
      "gitspecs.tags.create",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const name = await vscode.window.showInputBox({
          title: "Tag name",
          placeHolder: "v1.0.0",
          ignoreFocusOut: true,
        });
        if (!name?.trim()) return;
        const message = await vscode.window.showInputBox({
          title: "Annotation message (optional — empty = lightweight tag)",
          ignoreFocusOut: true,
        });
        if (message === undefined) return;
        await repo.tags.create({
          name: name.trim(),
          message: message.trim() || undefined,
        });
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.tags.delete",
      run(async (item?: TagItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo) return;
        const name =
          item?.tag.name ??
          (
            await vscode.window.showInputBox({
              title: "Tag to delete",
              ignoreFocusOut: true,
            })
          )?.trim();
        if (!name) return;
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Delete tag “${name}”?`,
            { modal: true },
            "Delete",
          );
          if (ok !== "Delete") return;
        }
        await repo.tags.delete({ name });
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.tags.copyName",
      runQuiet(async (item?: TagItem) => {
        const name = item?.tag.name;
        if (!name) return;
        await vscode.env.clipboard.writeText(name);
        void vscode.window.setStatusBarMessage("GitSpecs: tag name copied", 2000);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.tags.checkout",
      run(async (item?: TagItem) => {
        const repo = resolveRepoForItem(repos, item);
        if (!repo) return;
        const name = item?.tag.name;
        if (!name) return;
        const confirm = await vscode.window.showWarningMessage(
          `Check out tag “${name}” (detached HEAD)?`,
          { modal: true },
          "Checkout",
        );
        if (confirm !== "Checkout") return;
        await repo.branches.checkout({ commit: name });
      }),
    ),
  );
}
