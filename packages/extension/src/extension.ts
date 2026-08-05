import * as vscode from "vscode";
import { PlatformLog } from "./shell/log.js";
import { RepoContext } from "./shell/repoContext.js";
import { RefreshBus } from "./shell/refreshBus.js";
import { presentError } from "./shell/errors.js";
import { WorktreesProvider } from "./modules/worktrees/provider.js";
import { registerWorktreeCommands } from "./modules/worktrees/commands.js";
import { BranchesProvider } from "./modules/branches/provider.js";
import { registerBranchCommands } from "./modules/branches/commands.js";
import { CommitsProvider } from "./modules/commits/provider.js";
import { registerCommitCommands } from "./modules/commits/commands.js";
import { StashesProvider } from "./modules/stashes/provider.js";
import { registerStashCommands } from "./modules/stashes/commands.js";
import { TagsProvider } from "./modules/tags/provider.js";
import { registerTagCommands } from "./modules/tags/commands.js";
import { RemotesProvider } from "./modules/remotes/provider.js";
import { registerRemoteCommands } from "./modules/remotes/commands.js";
import { ContributorsProvider } from "./modules/contributors/provider.js";
import { registerContributorCommands } from "./modules/contributors/commands.js";
import { GraphProvider } from "./modules/graph/provider.js";
import { registerGraphCommands } from "./modules/graph/commands.js";
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
  const commitsProvider = new CommitsProvider(repos, refresh, log);
  const stashesProvider = new StashesProvider(repos, refresh, log);
  const tagsProvider = new TagsProvider(repos, refresh, log);
  const remotesProvider = new RemotesProvider(repos, refresh, log);
  const contributorsProvider = new ContributorsProvider(repos, refresh, log);
  const graphProvider = new GraphProvider(repos, refresh, log);
  context.subscriptions.push(
    worktreesProvider,
    branchesProvider,
    commitsProvider,
    stashesProvider,
    tagsProvider,
    remotesProvider,
    contributorsProvider,
    graphProvider,
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("gitspecs.worktrees", worktreesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.branches", branchesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.commits", commitsProvider),
    vscode.window.registerTreeDataProvider("gitspecs.stashes", stashesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.tags", tagsProvider),
    vscode.window.registerTreeDataProvider("gitspecs.remotes", remotesProvider),
    vscode.window.registerTreeDataProvider("gitspecs.contributors", contributorsProvider),
    vscode.window.registerTreeDataProvider("gitspecs.graph", graphProvider),
  );

  const scmTabs = new ScmTabState();
  await setScmTabContext(DEFAULT_SCM_TAB);
  const scmGrouped = new ScmGroupedProvider(
    scmTabs,
    worktreesProvider,
    branchesProvider,
    commitsProvider,
    stashesProvider,
  );
  context.subscriptions.push(
    scmGrouped,
    vscode.window.registerTreeDataProvider(SCM_CONSOLIDATED_VIEW_ID, scmGrouped),
  );

  const switchScmTab = async (tab: ScmTab): Promise<void> => {
    if (!scmTabs.setActive(tab)) return;
    await setScmTabContext(tab);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.scm.showWorktrees", () =>
      switchScmTab("worktrees"),
    ),
    vscode.commands.registerCommand("gitspecs.scm.showBranches", () =>
      switchScmTab("branches"),
    ),
    vscode.commands.registerCommand("gitspecs.scm.showCommits", () => switchScmTab("commits")),
    vscode.commands.registerCommand("gitspecs.scm.showStashes", () => switchScmTab("stashes")),
  );

  registerWorktreeCommands(context, repos, refresh, log);
  registerBranchCommands(context, repos, refresh, log);
  registerCommitCommands(context, repos, refresh, log);
  registerStashCommands(context, repos, refresh, log);
  registerTagCommands(context, repos, refresh, log);
  registerRemoteCommands(context, repos, refresh, log);
  registerContributorCommands(context, repos, refresh, log);
  registerGraphCommands(context, repos, refresh, log);
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

  log.info(
    "GitSpecs activated (worktrees, branches, commits, stashes, tags, remotes, contributors, graph, blame, history, compare, search)",
  );
}

export function deactivate(): void {
  // disposables handled via context.subscriptions
}
