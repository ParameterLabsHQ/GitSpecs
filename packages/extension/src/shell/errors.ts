import * as vscode from "vscode";
import {
  GitCommandError,
  GitConflictError,
  GitNotFoundError,
  NotAGitRepositoryError,
} from "@gitplatform/git-core";
import type { PlatformLog } from "./log.js";

export async function presentError(log: PlatformLog, err: unknown, title?: string): Promise<void> {
  let message = title ? `${title}: ` : "";
  if (err instanceof GitNotFoundError) {
    message += err.message;
    const action = await vscode.window.showErrorMessage(message, "Open Settings", "Show Output");
    if (action === "Open Settings") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "gitPlatform.git.path",
      );
    } else if (action === "Show Output") {
      log.show();
    }
    return;
  }
  if (err instanceof NotAGitRepositoryError) {
    message += err.message;
  } else if (err instanceof GitConflictError) {
    message += `${err.message}. Resolve conflicts in Source Control, then continue.`;
  } else if (err instanceof GitCommandError) {
    message += err.message;
    log.git(err.args, err.code, err.stderr);
  } else if (err instanceof Error) {
    message += err.message;
  } else {
    message += String(err);
  }

  log.error(message);
  const action = await vscode.window.showErrorMessage(message, "Show Output");
  if (action === "Show Output") {
    log.show();
  }
}
