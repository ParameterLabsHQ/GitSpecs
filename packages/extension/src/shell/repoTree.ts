import * as vscode from "vscode";
import * as path from "node:path";
import type { GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "./repoContext.js";

export { shouldGroupByRepo, multiRepoTreePlan } from "./repoTreePlan.js";

/**
 * Collapsible repository root shown when a workspace has more than one repo (P17).
 */
export class RepoRootItem extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(repo: GitRepository, isCurrent: boolean) {
    const label = path.basename(repo.root) || repo.root;
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repo.root;
    this.contextValue = "repoRoot";
    this.description = isCurrent ? "current" : repo.root;
    this.tooltip = repo.root;
    this.iconPath = new vscode.ThemeIcon(isCurrent ? "repo" : "folder");
  }
}

/** Any tree element that knows which repository it belongs to. */
export interface HasRepoRoot {
  readonly repoRoot: string;
}

export function isRepoRootItem(el: unknown): el is RepoRootItem {
  return el instanceof RepoRootItem;
}

export function isHasRepoRoot(el: unknown): el is HasRepoRoot {
  return (
    Boolean(el) &&
    typeof el === "object" &&
    typeof (el as HasRepoRoot).repoRoot === "string" &&
    (el as HasRepoRoot).repoRoot.length > 0
  );
}

/**
 * Resolve the repository for a tree command argument.
 * Prefer the item’s `repoRoot`, then fall back to current repo (palette / no selection).
 */
export function resolveRepoForItem(
  repos: RepoContext,
  item?: HasRepoRoot | RepoRootItem | undefined,
): GitRepository | undefined {
  if (item && isHasRepoRoot(item)) {
    const found = repos.repoByRoot(item.repoRoot);
    if (found) return found;
  }
  return repos.currentRepo;
}
