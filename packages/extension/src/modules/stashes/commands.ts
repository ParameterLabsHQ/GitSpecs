import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import type { StashItem } from "./provider.js";

function confirmDeletes(): boolean {
  return vscode.workspace.getConfiguration("gitspecs").get<boolean>("confirmDelete", true);
}

export function registerStashCommands(
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
    vscode.commands.registerCommand(
      "gitspecs.stashes.refresh",
      run(async () => {}),
    ),

    vscode.commands.registerCommand(
      "gitspecs.stashes.push",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) {
          void vscode.window.showInformationMessage("No Git repository selected");
          return;
        }
        const message = await vscode.window.showInputBox({
          title: "Stash message (optional)",
          placeHolder: "WIP description",
          ignoreFocusOut: true,
        });
        // Cancel → undefined; empty string is valid (no -m)
        if (message === undefined) return;
        await repo.stashes.push({
          message: message.trim() || undefined,
        });
        void vscode.window.setStatusBarMessage("GitSpecs: changes stashed", 2500);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.stashes.apply",
      run(async (item?: StashItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const stash = item?.stash ?? (await pickStash(repos));
        if (!stash) return;
        await repo.stashes.apply({ stash: stash.ref });
        void vscode.window.setStatusBarMessage(
          `GitSpecs: applied ${stash.ref}`,
          2500,
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.stashes.pop",
      run(async (item?: StashItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const stash = item?.stash ?? (await pickStash(repos));
        if (!stash) return;
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Pop ${stash.ref}? This applies and removes the stash.`,
            { modal: true },
            "Pop",
          );
          if (ok !== "Pop") return;
        }
        await repo.stashes.pop({ stash: stash.ref });
        void vscode.window.setStatusBarMessage(`GitSpecs: popped ${stash.ref}`, 2500);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.stashes.drop",
      run(async (item?: StashItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const stash = item?.stash ?? (await pickStash(repos));
        if (!stash) return;
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Drop ${stash.ref}? This permanently deletes the stash.`,
            { modal: true },
            "Drop",
          );
          if (ok !== "Drop") return;
        }
        await repo.stashes.drop({ stash: stash.ref });
        void vscode.window.setStatusBarMessage(`GitSpecs: dropped ${stash.ref}`, 2500);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.stashes.show",
      runQuiet(async (item?: StashItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const stash = item?.stash ?? (await pickStash(repos));
        if (!stash) return;
        const patch = await repo.stashes.show({ stash: stash.ref });
        const doc = await vscode.workspace.openTextDocument({
          content: patch || "(empty stash patch)\n",
          language: "diff",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
        log.info(`Stash show ${stash.ref}`);
      }),
    ),
  );
}

async function pickStash(repos: RepoContext) {
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  const list = await repo.stashes.list();
  if (list.length === 0) {
    void vscode.window.showInformationMessage("No stashes in this repository");
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    list.map((s) => ({
      label: s.ref,
      description: s.message,
      detail: s.sha.slice(0, 7),
      stash: s,
    })),
    { title: "Select stash", matchOnDescription: true },
  );
  return pick?.stash;
}
