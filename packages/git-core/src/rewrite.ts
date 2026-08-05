import { access } from "node:fs/promises";
import path from "node:path";
import type { GitRepository } from "./repository.js";
import { DirtyWorktreeError } from "./errors.js";

export type RewriteKind = "merge" | "rebase" | "cherry-pick" | "none";

export interface RewriteStatus {
  kind: RewriteKind;
  /** Human-readable state for UI. */
  label: string;
  /** Paths currently unmerged, when available. */
  conflictedPaths: string[];
}

export interface GuidedRebaseOptions {
  onto: string;
  /** When true (default), refuse to start if the worktree is dirty. */
  requireClean?: boolean;
}

export interface GuidedCherryPickOptions {
  commits: string[];
  requireClean?: boolean;
}

/**
 * Safer history-rewrite helpers: in-progress detection, abort/continue,
 * and guided rebase/cherry-pick with clean-tree preflight.
 * Does **not** implement a full sequence editor or mergetool.
 */
export class RewriteApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * Detect merge / rebase / cherry-pick in progress and list unmerged paths.
   */
  async status(): Promise<RewriteStatus> {
    const gitDir = (
      await this.repo.exec(["rev-parse", "--git-dir"])
    ).stdout.trim();
    const absGit = path.isAbsolute(gitDir)
      ? gitDir
      : path.join(this.repo.root, gitDir);

    const kind = await detectRewriteKind(absGit);
    const conflictedPaths = await listUnmergedPaths(this.repo);
    const label = labelForKind(kind, conflictedPaths.length);
    return { kind, label, conflictedPaths };
  }

  async abort(): Promise<void> {
    const st = await this.status();
    if (st.kind === "none") {
      throw new Error("No merge, rebase, or cherry-pick in progress");
    }
    if (st.kind === "merge") {
      await this.repo.exec(["merge", "--abort"]);
      return;
    }
    if (st.kind === "rebase") {
      await this.repo.exec(["rebase", "--abort"]);
      return;
    }
    await this.repo.exec(["cherry-pick", "--abort"]);
  }

  async continueOp(): Promise<void> {
    const st = await this.status();
    if (st.kind === "none") {
      throw new Error("No merge, rebase, or cherry-pick in progress");
    }
    if (st.conflictedPaths.length > 0) {
      throw new Error(
        `Cannot continue: ${st.conflictedPaths.length} conflicted path(s) remain. Resolve them first.`,
      );
    }
    if (st.kind === "merge") {
      // Completing a merge usually requires commit; try --continue is not valid for merge.
      await this.repo.exec(["commit", "--no-edit"]);
      return;
    }
    if (st.kind === "rebase") {
      await this.repo.exec(["rebase", "--continue"]);
      return;
    }
    await this.repo.exec(["cherry-pick", "--continue"]);
  }

  /**
   * Rebase current branch onto `onto` after optional clean-tree check.
   * Conflicts surface as GitConflictError from exec.
   */
  async guidedRebase(options: GuidedRebaseOptions): Promise<void> {
    const onto = options.onto.trim();
    if (!onto) throw new Error("rebase requires an onto ref");
    if (options.requireClean !== false) {
      await assertCleanWorktree(this.repo);
    }
    const inProgress = await this.status();
    if (inProgress.kind !== "none") {
      throw new Error(
        `Cannot start rebase: ${inProgress.label}. Abort or finish it first.`,
      );
    }
    await this.repo.branches.rebase({ onto });
  }

  async guidedCherryPick(options: GuidedCherryPickOptions): Promise<void> {
    if (!options.commits.length) {
      throw new Error("cherry-pick requires at least one commit");
    }
    if (options.requireClean !== false) {
      await assertCleanWorktree(this.repo);
    }
    const inProgress = await this.status();
    if (inProgress.kind !== "none") {
      throw new Error(
        `Cannot start cherry-pick: ${inProgress.label}. Abort or finish it first.`,
      );
    }
    await this.repo.branches.cherryPick({ commits: options.commits });
  }
}

async function detectRewriteKind(absGitDir: string): Promise<RewriteKind> {
  if (await pathExists(path.join(absGitDir, "CHERRY_PICK_HEAD"))) {
    return "cherry-pick";
  }
  if (
    (await pathExists(path.join(absGitDir, "rebase-merge"))) ||
    (await pathExists(path.join(absGitDir, "rebase-apply")))
  ) {
    return "rebase";
  }
  if (await pathExists(path.join(absGitDir, "MERGE_HEAD"))) {
    return "merge";
  }
  return "none";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listUnmergedPaths(repo: GitRepository): Promise<string[]> {
  const result = await repo.exec(["diff", "--name-only", "--diff-filter=U"], {
    allowFailure: true,
  });
  if (result.code !== 0 && !result.stdout.trim()) return [];
  return result.stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function assertCleanWorktree(repo: GitRepository): Promise<void> {
  const result = await repo.exec(["status", "--porcelain"], { allowFailure: true });
  if (result.stdout.trim()) {
    throw new DirtyWorktreeError(
      "Working tree has uncommitted changes. Commit or stash before rewrite.",
    );
  }
}

function labelForKind(kind: RewriteKind, conflictCount: number): string {
  if (kind === "none") return "No rewrite in progress";
  const base =
    kind === "merge"
      ? "Merge in progress"
      : kind === "rebase"
        ? "Rebase in progress"
        : "Cherry-pick in progress";
  if (conflictCount > 0) {
    return `${base} (${conflictCount} conflicted path${conflictCount === 1 ? "" : "s"})`;
  }
  return base;
}

/** Pure helper for conflict messaging (extension + tests). */
export function formatConflictGuidance(
  kind: RewriteKind,
  conflictedPaths: string[],
): string {
  if (kind === "none") {
    return "No merge, rebase, or cherry-pick is in progress.";
  }
  const op =
    kind === "merge" ? "merge" : kind === "rebase" ? "rebase" : "cherry-pick";
  const head = `A ${op} is in progress.`;
  if (conflictedPaths.length === 0) {
    return `${head} Resolve any remaining steps, then continue or abort.`;
  }
  const sample = conflictedPaths.slice(0, 5).join(", ");
  const more =
    conflictedPaths.length > 5
      ? ` (+${conflictedPaths.length - 5} more)`
      : "";
  return `${head} Conflicted: ${sample}${more}. Fix files, stage them, then Continue — or Abort to undo.`;
}
