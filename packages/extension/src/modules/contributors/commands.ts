import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import type { ContributorItem } from "./provider.js";

export function registerContributorCommands(
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
    vscode.commands.registerCommand("gitspecs.contributors.refresh", run(async () => {})),

    vscode.commands.registerCommand(
      "gitspecs.contributors.copyName",
      runQuiet(async (item?: ContributorItem) => {
        const name = item?.contributor.name;
        if (!name) return;
        await vscode.env.clipboard.writeText(name);
        void vscode.window.setStatusBarMessage("GitSpecs: author name copied", 2000);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.contributors.copyEmail",
      runQuiet(async (item?: ContributorItem) => {
        const email = item?.contributor.email;
        if (!email) {
          void vscode.window.showInformationMessage("No email for this contributor");
          return;
        }
        await vscode.env.clipboard.writeText(email);
        void vscode.window.setStatusBarMessage("GitSpecs: author email copied", 2000);
      }),
    ),
  );
}
