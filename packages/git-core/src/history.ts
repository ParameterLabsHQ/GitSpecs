import type { GitRepository } from "./repository.js";
import { toRepoRelative } from "./blame.js";
import { GitCommandError } from "./errors.js";

/** One commit from file or line history (newest-first). */
export interface HistoryCommit {
  sha: string;
  subject: string;
  author: string;
  /** Unix epoch seconds (author date). */
  authorTime: number;
  authorMail?: string;
}

export interface FileHistoryOptions {
  /** Max commits to return (default 100). */
  limit?: number;
  /** Start walking from this revision (default: HEAD / working-tree history). */
  rev?: string;
}

export interface LineHistoryOptions {
  /** 1-based start line (inclusive). */
  startLine: number;
  /** 1-based end line (inclusive). */
  endLine: number;
  /** Max commits to return (default 100). */
  limit?: number;
  /** Start walking from this revision. */
  rev?: string;
}

export interface CommitSearchOptions {
  /** Match commit message (`git log --grep`). Fixed-string via `--fixed-strings` when set. */
  grep?: string;
  /** Match author name/email (`git log --author`). */
  author?: string;
  /** Max commits to return (default 100). */
  limit?: number;
  /**
   * When true (default), treat `grep` as a fixed string (`--fixed-strings`) so
   * user input is not interpreted as a regex. Author always uses git's basic
   * pattern match for `--author`.
   */
  fixedStrings?: boolean;
  /**
   * When true (default), search all refs (`git log --all`) so hits on other
   * branches are included. Set false to walk only the current HEAD ancestry.
   */
  all?: boolean;
}

export interface RecentCommitsOptions {
  /** Max commits to return (default 100). Clamped to 1–10_000. */
  limit?: number;
  /**
   * Revision to start walking from (default: HEAD — current branch ancestry).
   * Pass a branch/tag/sha to list that history instead.
   */
  rev?: string;
}

/**
 * One commit from file history with the path as it existed at that revision
 * (rename-aware when obtained via `git log --follow --name-only`).
 */
export interface FileHistoryEntry extends HistoryCommit {
  /** Repo-relative path of the file in this commit. */
  pathAtRev: string;
}

/**
 * Previous / next neighbors of a `(path, sha)` pair along the rename-aware
 * file history sequence (`git log --follow`, newest-first).
 *
 * - **previous** — older commit that touched the path (toward root history)
 * - **next** — newer commit that touched the path (toward HEAD)
 *
 * When `sha` is not found within the walked window, `index` is `-1` and both
 * neighbors are undefined (caller may raise the limit).
 */
export interface RevisionNeighbors {
  /** Older commit (toward history root). */
  previous?: FileHistoryEntry;
  /** Newer commit (toward HEAD). */
  next?: FileHistoryEntry;
  /** The matching entry for `sha` when found in the sequence. */
  current?: FileHistoryEntry;
  /** 0-based index in newest-first sequence, or `-1` if not found. */
  index: number;
  /** Full sequence window used for resolution (newest-first). */
  sequence: FileHistoryEntry[];
}

export interface RevisionNeighborsOptions {
  /** Max commits to walk (default 100). Clamped to 1–10_000. */
  limit?: number;
  /** Start walking from this revision (default: HEAD). */
  rev?: string;
}

/**
 * Machine-readable log format:
 *   sha \0 author \0 author-mail \0 author-time \0 subject
 * One record per line (`%s` is single-line subject).
 */
export const HISTORY_LOG_FORMAT = "%H%x00%an%x00%ae%x00%at%x00%s";

const DEFAULT_LIMIT = 100;

export class HistoryApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * Recent commits on the current branch (HEAD ancestry) via `git log`.
   * Newest-first with sha, subject, author, authorTime.
   * Optional `rev` walks from another tip; default is HEAD.
   */
  async recent(options: RecentCommitsOptions = {}): Promise<HistoryCommit[]> {
    const limit = clampLimit(options.limit);
    const args = ["log", `-n${limit}`, `--format=${HISTORY_LOG_FORMAT}`];
    const rev = options.rev?.trim();
    if (rev) {
      args.push(rev);
    }
    const result = await this.repo.exec(args);
    return parseHistoryLog(result.stdout);
  }

  /**
   * File history via `git log --follow` (rename-aware).
   * Commits are newest-first with sha, subject, author, authorTime.
   */
  async file(path: string, options: FileHistoryOptions = {}): Promise<HistoryCommit[]> {
    const rel = toRepoRelative(this.repo.root, path);
    const limit = clampLimit(options.limit);
    const args = ["log", "--follow", `-n${limit}`, `--format=${HISTORY_LOG_FORMAT}`];
    if (options.rev) {
      args.push(options.rev);
    }
    args.push("--", rel);

    const result = await this.repo.exec(args);
    return parseHistoryLog(result.stdout);
  }

  /**
   * Line-range history via `git log -L start,end:path`.
   *
   * **Fallback policy:** when `-L` fails (common with renames, binary files, or
   * older edge cases on git 2.23+), fall back to file history with `--follow`
   * for the same path/limit. Line precision is lost in that case; the return
   * shape is still `HistoryCommit[]` (no separate error flag).
   */
  async line(path: string, options: LineHistoryOptions): Promise<HistoryCommit[]> {
    const rel = toRepoRelative(this.repo.root, path);
    const start = Math.max(1, Math.floor(options.startLine));
    const end = Math.max(start, Math.floor(options.endLine));
    const limit = clampLimit(options.limit);
    const rangeSpec = `${start},${end}:${rel}`;

    const args = [
      "log",
      `-L${rangeSpec}`,
      `-n${limit}`,
      // -L prints a patch by default; suppress so only our format records remain.
      "--no-patch",
      `--format=${HISTORY_LOG_FORMAT}`,
    ];
    if (options.rev) {
      args.push(options.rev);
    }

    try {
      const result = await this.repo.exec(args);
      return parseHistoryLog(result.stdout);
    } catch (err) {
      if (!(err instanceof GitCommandError)) throw err;
      // Documented fallback: rename / -L unsupported → file history with --follow
      return this.file(path, { limit: options.limit, rev: options.rev });
    }
  }

  /**
   * Blob content of `path` at `rev` (`git show rev:path`).
   * Useful for “view file at revision” without checking out.
   *
   * **Rename policy:** when `path` does not exist at `rev` (typical after a
   * rename), resolve the historical path via `git log --follow --name-only`
   * and retry `git show`. Throws `GitCommandError` if the blob cannot be read.
   */
  async showFile(path: string, rev: string): Promise<string> {
    const rel = toRepoRelative(this.repo.root, path);
    try {
      const result = await this.repo.exec(["show", `${rev}:${rel}`]);
      return result.stdout;
    } catch (err) {
      if (!(err instanceof GitCommandError)) throw err;
      const resolved = await this.resolvePathAtRevision(rel, rev);
      if (!resolved || resolved === rel) throw err;
      const retry = await this.repo.exec(["show", `${rev}:${resolved}`]);
      return retry.stdout;
    }
  }

  /**
   * File history with per-commit path (`git log --follow --name-only`).
   * Newest-first. After renames, `pathAtRev` is the name as of that commit.
   */
  async fileWithPaths(
    path: string,
    options: FileHistoryOptions = {},
  ): Promise<FileHistoryEntry[]> {
    const rel = toRepoRelative(this.repo.root, path);
    const limit = clampLimit(options.limit);
    const args = [
      "log",
      "--follow",
      `-n${limit}`,
      `--format=${HISTORY_LOG_FORMAT}`,
      "--name-only",
    ];
    if (options.rev) {
      args.push(options.rev);
    }
    args.push("--", rel);

    const result = await this.repo.exec(args);
    return parseFileHistoryWithPaths(result.stdout, rel);
  }

  /**
   * Resolve previous/next revision for `(path, sha)` from the rename-aware
   * `git log --follow` sequence (newest-first). Reuses the same ordering as
   * `file` / `fileWithPaths`.
   *
   * Matching is by full SHA or unique short prefix (case-insensitive).
   */
  async revisionNeighbors(
    path: string,
    sha: string,
    options: RevisionNeighborsOptions = {},
  ): Promise<RevisionNeighbors> {
    const needle = sha.trim().toLowerCase();
    if (!needle) {
      return { index: -1, sequence: [] };
    }

    const sequence = await this.fileWithPaths(path, {
      limit: options.limit,
      rev: options.rev,
    });

    // Prefer exact full-SHA match; fall back to unique short-prefix match.
    let index = sequence.findIndex((c) => c.sha.toLowerCase() === needle);
    if (index < 0 && needle.length >= 7) {
      const prefixHits = sequence
        .map((c, i) => (c.sha.toLowerCase().startsWith(needle) ? i : -1))
        .filter((i) => i >= 0);
      if (prefixHits.length === 1) {
        index = prefixHits[0]!;
      }
    }
    if (index < 0) {
      return { index: -1, sequence };
    }

    // Newest-first: index+1 is older (previous), index-1 is newer (next).
    const current = sequence[index]!;
    const previous = index + 1 < sequence.length ? sequence[index + 1] : undefined;
    const next = index > 0 ? sequence[index - 1] : undefined;
    return { previous, next, current, index, sequence };
  }

  /**
   * Resolve the repo-relative path of `path` as it existed at `rev`, following
   * renames from the current name. Returns undefined when not found in the
   * follow window (default limit 500).
   */
  async resolvePathAtRevision(
    path: string,
    rev: string,
    options: { limit?: number } = {},
  ): Promise<string | undefined> {
    const rel = toRepoRelative(this.repo.root, path);
    const needle = rev.trim().toLowerCase();
    if (!needle) return undefined;

    const sequence = await this.fileWithPaths(rel, {
      limit: options.limit ?? 500,
    });
    const hit = sequence.find(
      (c) =>
        c.sha.toLowerCase() === needle ||
        c.sha.toLowerCase().startsWith(needle),
    );
    return hit?.pathAtRev;
  }

  /**
   * Search commits by message and/or author via `git log --grep` / `--author`.
   * Requires at least one of `grep` or `author` (non-empty after trim).
   * Results are newest-first `HistoryCommit[]`.
   */
  async search(options: CommitSearchOptions): Promise<HistoryCommit[]> {
    const grep = options.grep?.trim() ?? "";
    const author = options.author?.trim() ?? "";
    if (!grep && !author) {
      throw new Error("search requires grep and/or author");
    }

    const limit = clampLimit(options.limit);
    const fixedStrings = options.fixedStrings !== false;
    const allRefs = options.all !== false;
    const args = ["log", `-n${limit}`, `--format=${HISTORY_LOG_FORMAT}`];
    if (allRefs) {
      args.push("--all");
    }

    if (grep) {
      if (fixedStrings) args.push("--fixed-strings");
      args.push(`--grep=${grep}`);
    }
    if (author) {
      args.push(`--author=${author}`);
    }

    const result = await this.repo.exec(args);
    return parseHistoryLog(result.stdout);
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), 10_000);
}

/**
 * Parse stdout from `git log --format=HISTORY_LOG_FORMAT`.
 * Empty / whitespace-only stdout → empty array (no throw).
 */
export function parseHistoryLog(stdout: string): HistoryCommit[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  const commits: HistoryCommit[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const parts = line.split("\0");
    if (parts.length < 5) continue;
    const [sha, author, authorMail, authorTimeRaw, ...subjectParts] = parts;
    if (!sha || !/^[0-9a-f]{7,64}$/i.test(sha)) continue;
    const authorTime = Number(authorTimeRaw);
    commits.push({
      sha,
      author: author ?? "",
      authorMail: authorMail || undefined,
      authorTime: Number.isFinite(authorTime) ? authorTime : 0,
      // Subject may theoretically contain nulls if format is extended; rejoin.
      subject: subjectParts.join("\0"),
    });
  }
  return commits;
}

/**
 * Parse `git log --follow --format=HISTORY_LOG_FORMAT --name-only` stdout.
 *
 * Git emits (newest-first):
 * ```
 * <sha>\0<author>\0<mail>\0<time>\0<subject>
 * <blank>
 * <path-at-rev>
 * <blank>
 * ...
 * ```
 *
 * When a path line is missing for a commit, falls back to `fallbackPath`.
 */
export function parseFileHistoryWithPaths(
  stdout: string,
  fallbackPath: string,
): FileHistoryEntry[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  const entries: FileHistoryEntry[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    i += 1;
    if (!line) continue;

    const parts = line.split("\0");
    if (parts.length < 5) continue;
    const [sha, author, authorMail, authorTimeRaw, ...subjectParts] = parts;
    if (!sha || !/^[0-9a-f]{7,64}$/i.test(sha)) continue;

    // Skip blank lines, then take the first non-empty non-commit path line.
    let pathAtRev = fallbackPath;
    while (i < lines.length) {
      const candidate = lines[i] ?? "";
      if (!candidate) {
        i += 1;
        continue;
      }
      // Next commit record starts with a SHA\0… line — stop without consuming.
      if (/^[0-9a-f]{7,64}\x00/i.test(candidate) || /^[0-9a-f]{40}/i.test(candidate.split("\0")[0] ?? "")) {
        const head = candidate.split("\0")[0] ?? "";
        if (/^[0-9a-f]{7,64}$/i.test(head) && candidate.includes("\0")) {
          break;
        }
      }
      // Path lines have no nulls and are not empty.
      if (!candidate.includes("\0")) {
        pathAtRev = candidate.replace(/\\/g, "/");
        i += 1;
        break;
      }
      break;
    }

    const authorTime = Number(authorTimeRaw);
    entries.push({
      sha,
      author: author ?? "",
      authorMail: authorMail || undefined,
      authorTime: Number.isFinite(authorTime) ? authorTime : 0,
      subject: subjectParts.join("\0"),
      pathAtRev,
    });
  }
  return entries;
}
