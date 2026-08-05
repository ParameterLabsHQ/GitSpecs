import * as vscode from "vscode";
import type { CompareResult } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import {
  buildComparePickItems,
  formatCompareReport,
  formatCompareSummary,
  resolveCompareUrl,
  type ComparePickItem,
} from "./format.js";
import { openDualPaneCompare } from "./compareView.js";

/** Sentinel label for working-tree compare in QuickPick. */
export const WORKING_TREE_PICK = "$(git-commit) Working Tree";

export function registerCompareCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    // Palette entry: pick head (incl. working tree) then base.
    vscode.commands.registerCommand(
      "gitspecs.compare",
      run(async () => {
        await runCompareInteractive(repos, log);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.compare.dualPane",
      run(async () => {
        await openDualPaneCompare(context, repos, log);
      }),
    ),
  );
}

/**
 * Shared compare flow used by `gitspecs.compare` and `gitspecs.branches.compare`.
 * @param headHint pre-selected head ref (e.g. from tree item); undefined → pick
 */
export async function runCompareInteractive(
  repos: RepoContext,
  log: PlatformLog,
  headHint?: string,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  let head: string | undefined;
  let againstWorkingTree = false;

  if (headHint) {
    head = headHint;
  } else {
    const picked = await pickHeadRef(repos);
    if (!picked) return;
    againstWorkingTree = picked.againstWorkingTree;
    head = picked.ref;
  }

  const base = await pickBaseRef(repos, head, againstWorkingTree);
  if (!base) return;

  const result = await repo.branches.compare({
    base,
    head: againstWorkingTree ? undefined : head,
    againstWorkingTree,
  });

  await presentCompareResult(repos, log, result);
}

async function presentCompareResult(
  repos: RepoContext,
  log: PlatformLog,
  result: CompareResult,
): Promise<void> {
  const summary = formatCompareSummary(result);
  log.info(summary);
  log.info(formatCompareReport(result));

  let hostUrl: string | undefined;
  const repo = repos.currentRepo;
  if (repo) {
    try {
      const remoteUrl = await repo.branches.getRemoteUrl("origin");
      hostUrl = resolveCompareUrl(
        remoteUrl,
        result.base,
        result.head,
        result.againstWorkingTree,
      );
    } catch {
      hostUrl = undefined;
    }
  }

  const items = buildComparePickItems(result, { hasHostUrl: Boolean(hostUrl) });
  const pick = await vscode.window.showQuickPick(
    items.map((item) => toQuickPickItem(item)),
    {
      title: "GitSpecs Compare",
      placeHolder: summary,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!pick) return;

  const selected = pick.item;
  if (selected.kind === "action") {
    switch (selected.id) {
      case "openHostCompare":
        if (hostUrl) {
          await vscode.env.openExternal(vscode.Uri.parse(hostUrl));
        }
        break;
      case "copySummary":
        await vscode.env.clipboard.writeText(summary);
        void vscode.window.setStatusBarMessage("GitSpecs: compare summary copied", 2000);
        break;
      case "showOutput":
        log.show();
        break;
      default:
        break;
    }
    return;
  }

  // File row: copy path (useful for follow-up)
  await vscode.env.clipboard.writeText(selected.path);
  void vscode.window.setStatusBarMessage(
    `GitSpecs: copied ${selected.path}`,
    2000,
  );
}

function toQuickPickItem(item: ComparePickItem): vscode.QuickPickItem & {
  item: ComparePickItem;
} {
  if (item.kind === "action") {
    return {
      label: item.label,
      description: item.description,
      item,
    };
  }
  return {
    label: item.label,
    description: item.description,
    detail: item.detail,
    item,
  };
}

interface HeadPick {
  ref?: string;
  againstWorkingTree: boolean;
}

async function pickHeadRef(repos: RepoContext): Promise<HeadPick | undefined> {
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  const list = await repo.branches.list({ includeRemotes: true });
  const picks: Array<vscode.QuickPickItem & { againstWorkingTree: boolean; ref?: string }> = [
    {
      label: WORKING_TREE_PICK,
      description: "Uncommitted changes vs a base ref",
      againstWorkingTree: true,
    },
    ...list.map((b) => ({
      label: b.name,
      description: b.remote ? "remote" : b.current ? "current" : "",
      againstWorkingTree: false,
      ref: b.name,
    })),
  ];
  const pick = await vscode.window.showQuickPick(picks, {
    title: "Compare — select head (or Working Tree)",
    placeHolder: "Head ref",
  });
  if (!pick) return undefined;
  return {
    againstWorkingTree: pick.againstWorkingTree,
    ref: pick.ref,
  };
}

async function pickBaseRef(
  repos: RepoContext,
  head: string | undefined,
  againstWorkingTree: boolean,
): Promise<string | undefined> {
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  const list = await repo.branches.list({ includeRemotes: true });
  const title = againstWorkingTree
    ? "Compare — select base ref (vs Working Tree)"
    : `Compare — select base (head: ${head})`;
  const pick = await vscode.window.showQuickPick(
    list.map((b) => ({
      label: b.name,
      description: b.remote ? "remote" : b.current ? "current" : "",
    })),
    { title, placeHolder: "Base ref" },
  );
  return pick?.label;
}
