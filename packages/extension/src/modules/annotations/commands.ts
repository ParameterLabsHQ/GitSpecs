import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import type { ChangesAnnotationController } from "./controller.js";

export function registerAnnotationCommands(
  context: vscode.ExtensionContext,
  _repos: RepoContext,
  log: PlatformLog,
  controller: ChangesAnnotationController,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.annotations.toggleChanges",
      run(async () => {
        await controller.toggle();
        log.info(
          `Changes annotations ${controller.isEnabled() ? "enabled" : "disabled"}`,
        );
      }),
    ),
  );
}
