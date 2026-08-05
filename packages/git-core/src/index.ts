export { findGit, type GitBinary } from "./git.js";
export {
  GitRepository,
  openRepository,
  discoverRepos,
  type RepoRoot,
} from "./repository.js";
export {
  WorktreesApi,
  parseWorktreePorcelain,
  type WorktreeInfo,
  type WorktreeAddOptions,
  type WorktreeRemoveOptions,
} from "./worktrees.js";
export {
  BranchesApi,
  type BranchInfo,
  type CompareResult,
} from "./branches.js";
export {
  GitNotFoundError,
  NotAGitRepositoryError,
  GitCommandError,
  GitConflictError,
  DirtyWorktreeError,
} from "./errors.js";
export { execGit, type ExecResult, type ExecOptions } from "./exec.js";
