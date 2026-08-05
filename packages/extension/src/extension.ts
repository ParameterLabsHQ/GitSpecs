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
import { BlameCodeLensProvider } from "./modules/blame/codeLens.js";
import { registerHistoryCommands } from "./modules/history/commands.js";
import { registerCompareCommands } from "./modules/compare/commands.js";
import { registerSearchCommands } from "./modules/search/commands.js";
import {
  DEFAULT_SCM_TAB,
  SCM_CONSOLIDATED_VIEW_ID,
  SCM_TAB_CONTEXT_KEY,
  ScmTabState,
  type ScmTab,
} from "./shell/scmTabs.js";
import { ScmGroupedProvider } from "./shell/scmGroupedProvider.js";

async function setScmTabContext(tab: ScmTab): Promise<void> {
  await vscode.commands.executeCommand("setContext", SCM_TAB_CONTEXT_KEY, tab);
}

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

  // Activity-bar dual views keep dedicated providers.
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("gitspecs.worktrees", worktreesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.branches", branchesProvider),
  );

  // Single consolidated SCM panel with Worktrees/Branches tabs (GitLens-style).
  const scmTabs = new ScmTabState();
  await setScmTabContext(DEFAULT_SCM_TAB);
  const scmGrouped = new ScmGroupedProvider(scmTabs, worktreesProvider, branchesProvider);
  context.subscriptions.push(
    scmGrouped,
    vscode.window.registerTreeDataProvider(SCM_CONSOLIDATED_VIEW_ID, scmGrouped),
  );

  const switchScmTab = async (tab: ScmTab): Promise<void> => {
    if (!scmTabs.setActive(tab)) return;
    await setScmTabContext(tab);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.scm.showWorktrees", () => switchScmTab("worktrees")),
    vscode.commands.registerCommand("gitspecs.scm.showBranches", () => switchScmTab("branches")),
  );

  registerWorktreeCommands(context, repos, refresh, log);
  registerBranchCommands(context, repos, refresh, log);
  registerCompareCommands(context, repos, log);
  registerSearchCommands(context, repos, log);

  const blameController = new BlameController(repos, log);
  context.subscriptions.push(blameController);
  registerBlameCommands(context, repos, log, blameController);
  registerHistoryCommands(context, repos, log);

  const blameCodeLens = new BlameCodeLensProvider(
    repos,
    blameController.blameCache,
    log,
  );
  context.subscriptions.push(
    blameCodeLens,
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, blameCodeLens),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.switchRepository", async () => {
      await repos.switchRepositoryInteractive();
      refresh.fire();
    }),
  );

  log.info("GitSpecs activated (worktrees, branches, blame, history, compare, search)");
}

export function deactivate(): void {
  // disposables handled via context.subscriptions
}
