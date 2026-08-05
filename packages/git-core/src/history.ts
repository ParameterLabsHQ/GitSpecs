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
   */
  async showFile(path: string, rev: string): Promise<string> {
    const rel = toRepoRelative(this.repo.root, path);
    const result = await this.repo.exec(["show", `${rev}:${rel}`]);
    return result.stdout;
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
