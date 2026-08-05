import type { GitRepository } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";

/**
 * Resolve the correct workspace repo for a hub tree item (multi-repo safe).
 * Pure — no vscode import (unit-tested without the extension host).
 */
export function resolveHubRepo(
  repos: RepoContext,
  item?: { repoRoot?: string } | null,
): GitRepository | undefined {
  const root = item?.repoRoot?.trim();
  if (root) {
    return repos.repoByRoot(root) ?? repos.currentRepo;
  }
  return repos.currentRepo;
}
