import path from "node:path";
import { realpathSync } from "node:fs";
import type { GitRepository } from "./repository.js";

export interface WorktreeInfo {
  path: string;
  head?: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  prunableReason?: string;
}

export interface WorktreeAddOptions {
  path: string;
  /** Existing branch to check out */
  branch?: string;
  /** Start point ref when creating a new branch or detached */
  startPoint?: string;
  /** When true with `branch`, create new branch at startPoint (default HEAD) */
  createBranch?: boolean;
}

export interface WorktreeRemoveOptions {
  path: string;
  force?: boolean;
}

export class WorktreesApi {
  constructor(private readonly repo: GitRepository) {}

  async list(): Promise<WorktreeInfo[]> {
    const result = await this.repo.exec(["worktree", "list", "--porcelain", "-z"]);
    return parseWorktreePorcelain(result.stdout).map((w) => ({
      ...w,
      path: normalizePath(w.path),
    }));
  }

  async add(options: WorktreeAddOptions): Promise<WorktreeInfo> {
    const target = path.resolve(options.path);
    const args = ["worktree", "add"];

    if (options.createBranch && options.branch) {
      args.push("-b", options.branch, target);
      if (options.startPoint) {
        args.push(options.startPoint);
      }
    } else if (options.branch) {
      args.push(target, options.branch);
    } else if (options.startPoint) {
      args.push("--detach", target, options.startPoint);
    } else {
      args.push(target);
    }

    await this.repo.exec(args);
    const all = await this.list();
    const match = all.find((w) => pathsEqual(w.path, target));
    if (!match) {
      throw new Error(`Worktree added at ${target} but not found in list`);
    }
    return match;
  }

  async remove(options: WorktreeRemoveOptions): Promise<void> {
    const target = path.resolve(options.path);
    const args = ["worktree", "remove"];
    if (options.force) {
      args.push("--force");
    }
    args.push(target);
    await this.repo.exec(args);
  }

  async prune(): Promise<void> {
    await this.repo.exec(["worktree", "prune"]);
  }

  async lock(worktreePath: string, reason?: string): Promise<void> {
    const args = ["worktree", "lock", path.resolve(worktreePath)];
    if (reason) {
      args.push("--reason", reason);
    }
    await this.repo.exec(args);
  }

  async unlock(worktreePath: string): Promise<void> {
    await this.repo.exec(["worktree", "unlock", path.resolve(worktreePath)]);
  }
}

function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  try {
    return realpathSync(resolved);
  } catch {
    // Path may not exist yet; still normalize parent if possible
    try {
      const parent = path.dirname(resolved);
      const base = path.basename(resolved);
      return path.join(realpathSync(parent), base);
    } catch {
      return resolved;
    }
  }
}

function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function parseWorktreePorcelain(stdout: string): WorktreeInfo[] {
  const records = stdout.split("\0").filter((s) => s.length > 0);
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> | undefined;

  const pushCurrent = () => {
    if (current?.path) {
      worktrees.push({
        path: current.path,
        head: current.head,
        branch: current.branch,
        bare: current.bare ?? false,
        detached: current.detached ?? false,
        locked: current.locked ?? false,
        lockReason: current.lockReason,
        prunable: current.prunable ?? false,
        prunableReason: current.prunableReason,
      });
    }
    current = undefined;
  };

  for (const line of records) {
    if (line.startsWith("worktree ")) {
      pushCurrent();
      current = {
        path: line.slice("worktree ".length),
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }
    if (!current) continue;

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.replace(/^refs\/heads\//, "");
      current.detached = false;
    } else if (line === "detached") {
      current.detached = true;
      current.branch = undefined;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line.startsWith("locked")) {
      current.locked = true;
      if (line.startsWith("locked ")) {
        current.lockReason = line.slice("locked ".length);
      }
    } else if (line.startsWith("prunable")) {
      current.prunable = true;
      if (line.startsWith("prunable ")) {
        current.prunableReason = line.slice("prunable ".length);
      }
    }
  }
  pushCurrent();
  return worktrees;
}
