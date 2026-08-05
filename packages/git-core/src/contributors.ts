import type { GitRepository } from "./repository.js";

/** One author row from shortlog / log aggregation. */
export interface ContributorInfo {
  name: string;
  email?: string;
  /** Number of commits attributed to this author. */
  commits: number;
}

export interface ContributorsOptions {
  /** Max authors to return (default 100). */
  limit?: number;
  /**
   * When true (default), use all refs (`git shortlog --all` via log walk).
   * When false, only current HEAD ancestry.
   */
  all?: boolean;
}

const DEFAULT_LIMIT = 100;

/**
 * Contributors via `git shortlog -sne` (summary, numbered, email).
 * Sorted by commit count descending (git default).
 */
export class ContributorsApi {
  constructor(private readonly repo: GitRepository) {}

  async list(options: ContributorsOptions = {}): Promise<ContributorInfo[]> {
    const limit = clampLimit(options.limit);
    const all = options.all !== false;
    // -s summary, -n sort by count, -e show email. Limit applied after parse.
    const args = ["shortlog", "-sne"];
    if (all) {
      args.push("--all");
    } else {
      args.push("HEAD");
    }
    const result = await this.repo.exec(args, { allowFailure: true });
    if (result.code !== 0) return [];
    return parseShortlog(result.stdout).slice(0, limit);
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), 10_000);
}

/**
 * Parse `git shortlog -sne` lines:
 *   "   12\tAda Lovelace <ada@example.com>"
 */
export function parseShortlog(stdout: string): ContributorInfo[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];
  const out: ContributorInfo[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    // leading spaces, count, tab, name, optional <email>
    const m = line.match(/^\s*(\d+)\t(.+)$/);
    if (!m) continue;
    const commits = Number(m[1]);
    const rest = m[2]!.trim();
    const emailMatch = rest.match(/^(.*?)\s*<([^>]+)>\s*$/);
    if (emailMatch) {
      out.push({
        name: emailMatch[1]!.trim() || emailMatch[2]!,
        email: emailMatch[2],
        commits: Number.isFinite(commits) ? commits : 0,
      });
    } else {
      out.push({
        name: rest,
        commits: Number.isFinite(commits) ? commits : 0,
      });
    }
  }
  return out;
}
