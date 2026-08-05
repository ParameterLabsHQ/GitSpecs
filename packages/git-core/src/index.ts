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
  parseNameStatus,
  type BranchInfo,
  type CompareResult,
  type CompareOptions,
  type NameStatusEntry,
} from "./branches.js";
export {
  BlameApi,
  parseBlamePorcelain,
  formatBlameAnnotation,
  toRepoRelative,
  type BlameLine,
  type BlameOptions,
} from "./blame.js";
export {
  HistoryApi,
  parseHistoryLog,
  HISTORY_LOG_FORMAT,
  type HistoryCommit,
  type FileHistoryOptions,
  type LineHistoryOptions,
  type CommitSearchOptions,
  type RecentCommitsOptions,
} from "./history.js";
export {
  StashesApi,
  parseStashList,
  resolveStashRef,
  STASH_LIST_FORMAT,
  type StashInfo,
  type StashPushOptions,
  type StashRefOptions,
} from "./stashes.js";
export {
  TagsApi,
  parseTagList,
  TAG_LIST_FORMAT,
  type TagInfo,
  type TagCreateOptions,
  type TagDeleteOptions,
} from "./tags.js";
export {
  RemotesApi,
  parseRemoteVerbose,
  type RemoteInfo,
} from "./remotes.js";
export {
  GitNotFoundError,
  NotAGitRepositoryError,
  GitCommandError,
  GitConflictError,
  DirtyWorktreeError,
} from "./errors.js";
export { execGit, type ExecResult, type ExecOptions } from "./exec.js";
