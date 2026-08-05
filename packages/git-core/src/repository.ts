import { realpath } from "node:fs/promises";
import path from "node:path";
import type { GitBinary } from "./git.js";
import { execGit, type ExecOptions, type ExecResult } from "./exec.js";
import { NotAGitRepositoryError } from "./errors.js";
import { WorktreesApi } from "./worktrees.js";
import { BranchesApi } from "./branches.js";
import { BlameApi } from "./blame.js";
import { HistoryApi } from "./history.js";
import { StashesApi } from "./stashes.js";
import { TagsApi } from "./tags.js";
import { RemotesApi } from "./remotes.js";
import { ContributorsApi } from "./contributors.js";
import { GraphApi } from "./graph.js";
import { RewriteApi } from "./rewrite.js";

export interface RepoRoot {
  root: string;
  commonDir?: string;
}

export class GitRepository {
  readonly worktrees: WorktreesApi;
  readonly branches: BranchesApi;
  readonly blame: BlameApi;
  readonly history: HistoryApi;
  readonly stashes: StashesApi;
  readonly tags: TagsApi;
  readonly remotes: RemotesApi;
  readonly contributors: ContributorsApi;
  readonly graph: GraphApi;
  readonly rewrite: RewriteApi;

  constructor(
    readonly root: string,
    readonly git: GitBinary,
  ) {
    this.worktrees = new WorktreesApi(this);
    this.branches = new BranchesApi(this);
    this.blame = new BlameApi(this);
    this.history = new HistoryApi(this);
    this.stashes = new StashesApi(this);
    this.tags = new TagsApi(this);
    this.remotes = new RemotesApi(this);
    this.contributors = new ContributorsApi(this);
    this.graph = new GraphApi(this);
    this.rewrite = new RewriteApi(this);
  }

  async exec(args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    return execGit(this.git.path, ["-C", this.root, ...args], options);
  }

  async revParse(args: string[]): Promise<string> {
    const result = await this.exec(["rev-parse", ...args]);
    return result.stdout.trim();
  }
}

export async function openRepository(root: string, git: GitBinary): Promise<GitRepository> {
  const resolved = path.resolve(root);
  try {
    const result = await execGit(git.path, ["-C", resolved, "rev-parse", "--show-toplevel"]);
    const top = result.stdout.trim();
    const realTop = await realpath(top).catch(() => top);
    return new GitRepository(realTop, git);
  } catch {
    throw new NotAGitRepositoryError(resolved);
  }
}

export async function discoverRepos(
  paths: string[],
  git: GitBinary,
): Promise<RepoRoot[]> {
  const found = new Map<string, RepoRoot>();
  for (const p of paths) {
    try {
      const repo = await openRepository(p, git);
      if (!found.has(repo.root)) {
        found.set(repo.root, { root: repo.root });
      }
    } catch {
      // skip non-repos
    }
  }
  return [...found.values()];
}
