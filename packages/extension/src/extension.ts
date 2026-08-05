import * as vscode from "vscode";
import { PlatformLog } from "./shell/log.js";
import { RepoContext } from "./shell/repoContext.js";
import { RefreshBus } from "./shell/refreshBus.js";
import { presentError } from "./shell/errors.js";
import { WorktreesProvider } from "./modules/worktrees/provider.js";
import { registerWorktreeCommands } from "./modules/worktrees/commands.js";
import { BranchesProvider } from "./modules/branches/provider.js";
import { registerBranchCommands } from "./modules/branches/commands.js";
import { BlameController } from "./modules/blame/controller.js";
import { registerBlameCommands } from "./modules/blame/commands.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = new PlatformLog();
  context.subscriptions.push(log);

  const repos = new RepoContext(log);
  context.subscriptions.push(repos);

  try {
    await repos.initialize();
  } catch (err) {
    await presentError(log, err, "GitSpecs activation");
  }

  const refresh = new RefreshBus(repos);
  context.subscriptions.push(refresh);

  const worktreesProvider = new WorktreesProvider(repos, refresh, log);
  const branchesProvider = new BranchesProvider(repos, refresh, log);
  context.subscriptions.push(worktreesProvider, branchesProvider);

  // Activity bar + Source Control (SCM) host the same providers (GitLens-style dual placement).
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("gitspecs.worktrees", worktreesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.branches", branchesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.scm.worktrees", worktreesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.scm.branches", branchesProvider),
  );

  registerWorktreeCommands(context, repos, refresh, log);
  registerBranchCommands(context, repos, refresh, log);

  const blameController = new BlameController(repos, log);
  context.subscriptions.push(blameController);
  registerBlameCommands(context, repos, log, blameController);

  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.switchRepository", async () => {
      await repos.switchRepositoryInteractive();
      refresh.fire();
    }),
  );

  log.info("GitSpecs activated");
}

export function deactivate(): void {
  // disposables handled via context.subscriptions
}
