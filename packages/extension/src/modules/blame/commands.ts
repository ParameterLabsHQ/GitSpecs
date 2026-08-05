import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import type { BlameController } from "./controller.js";
import type { ChangesAnnotationController } from "../annotations/controller.js";
import type { BlameDetailPayload } from "./detail.js";

export function registerBlameCommands(
  context: vscode.ExtensionContext,
  _repos: RepoContext,
  log: PlatformLog,
  controller: BlameController,
  changes?: ChangesAnnotationController,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.blame.toggleFile",
      run(async () => {
        await controller.toggle();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.showLine",
      run(async () => {
        await controller.showLine();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.fileToOutput",
      run(async () => {
        await controller.blameFileToOutput();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.statusBarDetails",
      run(async () => {
        await controller.showStatusBarDetails();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.codeLensDetail",
      run(async (payload?: BlameDetailPayload) => {
        if (payload?.sha) {
          await controller.showBlameDetail(payload);
          return;
        }
        // Fallback: current line when invoked without args
        await controller.showLine();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.toggleCodeLens",
      run(async () => {
        await controller.toggleCodeLens();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.copySha",
      run(async (sha?: string) => {
        await controller.copySha(sha);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.blame.openRemote",
      run(async (url?: string) => {
        await controller.openRemote(url);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.annotations.dismiss",
      run(async () => {
        const clearedBlame = await controller.dismissAnnotations();
        let clearedChanges = false;
        if (changes?.isEnabled()) {
          await changes.dismiss();
          clearedChanges = true;
        } else if (changes) {
          await changes.dismiss();
        }
        if (clearedBlame || clearedChanges) {
          void vscode.window.setStatusBarMessage(
            "GitSpecs: annotations dismissed",
            2000,
          );
        }
      }),
    ),
  );
}
