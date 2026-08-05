export interface BranchChoice {
  name: string;
  remote: boolean;
  detached?: boolean;
}

/**
 * Branches offered when creating a worktree from an existing branch.
 * Includes local branches with slashes (feature/foo) and all remote-tracking
 * names (origin/*, upstream/*, etc.). Skips detached HEAD pseudo-entries.
 */
export function existingWorktreeBranchNames(branches: BranchChoice[]): string[] {
  return branches.filter((b) => !b.detached).map((b) => b.name);
}

/**
 * Resolve which ref to pass to `git worktree add` for an existing-branch pick.
 * Remote-tracking names keep their remote prefix (origin/feature);
 * local names are used as-is (including feature/foo).
 */
export function worktreeBranchRefFromPick(pick: string): string {
  return pick;
}
