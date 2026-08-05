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
  parseFileHistoryWithPaths,
  HISTORY_LOG_FORMAT,
  type HistoryCommit,
  type FileHistoryEntry,
  type FileHistoryOptions,
  type LineHistoryOptions,
  type CommitSearchOptions,
  type RecentCommitsOptions,
  type RevisionNeighbors,
  type RevisionNeighborsOptions,
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
  ContributorsApi,
  parseShortlog,
  type ContributorInfo,
  type ContributorsOptions,
} from "./contributors.js";
export {
  GraphApi,
  parseGraphLog,
  parseDecorations,
  layoutGraph,
  clampGraphLimit,
  renderGraphPrefix,
  GRAPH_LOG_FORMAT,
  DEFAULT_GRAPH_LIMIT,
  MAX_GRAPH_LIMIT,
  type GraphCommit,
  type GraphCommitRaw,
  type GraphLogOptions,
  type GraphLogPage,
} from "./graph.js";
export {
  RewriteApi,
  formatConflictGuidance,
  type RewriteKind,
  type RewriteStatus,
  type GuidedRebaseOptions,
  type GuidedCherryPickOptions,
  type InteractiveRebaseOptions,
} from "./rewrite.js";
export {
  parseRebaseTodo,
  serializeRebaseTodo,
  applyTodoActions,
  actionableEntries,
  type RebaseTodoAction,
  type RebaseTodoEntry,
} from "./rebaseTodo.js";
export {
  ChangesApi,
  parseUnifiedDiffHunks,
  mergeAdjacentRanges,
  expandChangedLines,
  type ChangeLineKind,
  type ChangedLineRange,
  type ChangedLinesOptions,
} from "./changes.js";
export {
  GitNotFoundError,
  NotAGitRepositoryError,
  GitCommandError,
  GitConflictError,
  DirtyWorktreeError,
} from "./errors.js";
export { execGit, type ExecResult, type ExecOptions } from "./exec.js";
