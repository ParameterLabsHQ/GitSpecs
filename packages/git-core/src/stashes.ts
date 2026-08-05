import type { GitRepository } from "./repository.js";

/** One entry from `git stash list` (newest first, stash@{0} first). */
export interface StashInfo {
  /** 0-based index matching `stash@{n}`. */
  index: number;
  /** Ref like `stash@{0}`. */
  ref: string;
  /** Commit object SHA of the stash. */
  sha: string;
  /** Stash message / reflog subject. */
  message: string;
  /** Unix epoch seconds (committer date of stash commit), when available. */
  authorTime: number;
}

export interface StashPushOptions {
  /** Optional stash message (`-m`). */
  message?: string;
  /** Include untracked files (`-u`). */
  includeUntracked?: boolean;
  /**
   * When true, use `git stash push --keep-index` so staged changes stay staged.
   */
  keepIndex?: boolean;
}

export interface StashRefOptions {
  /** Stash selector: index number or `stash@{n}` (default: stash@{0}). */
  stash?: number | string;
}

/**
 * Machine-readable stash list format:
 *   ref \0 sha \0 committer-time \0 subject
 */
export const STASH_LIST_FORMAT = "%gd%x00%H%x00%ct%x00%gs";

export class StashesApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * List stashes newest-first via `git stash list`.
   * Empty stash stack → empty array (no throw).
   */
  async list(): Promise<StashInfo[]> {
    const result = await this.repo.exec(
      ["stash", "list", `--format=${STASH_LIST_FORMAT}`],
      { allowFailure: true },
    );
    if (result.code !== 0) {
      // No stash ref yet, or empty repo — treat as empty list.
      return [];
    }
    return parseStashList(result.stdout);
  }

  /**
   * Create a stash from the working tree (`git stash push`).
   * Returns the new top stash info when available.
   */
  async push(options: StashPushOptions = {}): Promise<StashInfo | undefined> {
    const args = ["stash", "push"];
    if (options.includeUntracked) args.push("--include-untracked");
    if (options.keepIndex) args.push("--keep-index");
    const msg = options.message?.trim();
    if (msg) {
      args.push("-m", msg);
    }
    await this.repo.exec(args);
    const list = await this.list();
    return list[0];
  }

  /** Apply a stash without removing it (`git stash apply`). */
  async apply(options: StashRefOptions = {}): Promise<void> {
    const ref = resolveStashRef(options.stash);
    await this.repo.exec(["stash", "apply", ref]);
  }

  /** Apply and drop a stash (`git stash pop`). */
  async pop(options: StashRefOptions = {}): Promise<void> {
    const ref = resolveStashRef(options.stash);
    await this.repo.exec(["stash", "pop", ref]);
  }

  /** Drop a stash entry (`git stash drop`). */
  async drop(options: StashRefOptions = {}): Promise<void> {
    const ref = resolveStashRef(options.stash);
    await this.repo.exec(["stash", "drop", ref]);
  }

  /**
   * Show stash patch or shortstat (`git stash show`).
   * Default: unified patch (`-p`). Set `stat: true` for `--stat` only.
   */
  async show(
    options: StashRefOptions & { stat?: boolean } = {},
  ): Promise<string> {
    const ref = resolveStashRef(options.stash);
    const args = ["stash", "show"];
    if (options.stat) {
      args.push("--stat");
    } else {
      args.push("-p");
    }
    args.push(ref);
    const result = await this.repo.exec(args);
    return result.stdout;
  }
}

/** Normalize index or `stash@{n}` to a git stash ref. */
export function resolveStashRef(stash: number | string | undefined): string {
  if (stash == null || stash === "") return "stash@{0}";
  if (typeof stash === "number") {
    if (!Number.isFinite(stash) || stash < 0) {
      throw new Error("stash index must be a non-negative integer");
    }
    return `stash@{${Math.floor(stash)}}`;
  }
  const trimmed = stash.trim();
  if (/^stash@\{\d+\}$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `stash@{${trimmed}}`;
  throw new Error(`invalid stash ref: ${stash}`);
}

/**
 * Parse stdout from `git stash list --format=STASH_LIST_FORMAT`.
 * Empty / whitespace → empty array.
 */
export function parseStashList(stdout: string): StashInfo[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  const out: StashInfo[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const parts = line.split("\0");
    if (parts.length < 4) continue;
    const [ref, sha, timeRaw, ...msgParts] = parts;
    if (!ref || !sha) continue;
    const indexMatch = /stash@\{(\d+)\}/.exec(ref);
    const index = indexMatch ? Number(indexMatch[1]) : out.length;
    const authorTime = Number(timeRaw);
    out.push({
      index: Number.isFinite(index) ? index : out.length,
      ref,
      sha,
      message: msgParts.join("\0"),
      authorTime: Number.isFinite(authorTime) ? authorTime : 0,
    });
  }
  return out;
}
