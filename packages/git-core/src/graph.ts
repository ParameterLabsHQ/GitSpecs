import type { GitRepository } from "./repository.js";

/** Default and hard max for graph walks (performance bound). */
export const DEFAULT_GRAPH_LIMIT = 200;
export const MAX_GRAPH_LIMIT = 500;

/** One commit node before lane layout. */
export interface GraphCommitRaw {
  sha: string;
  parents: string[];
  author: string;
  authorTime: number;
  subject: string;
  /** Decoration from `%D` (branch/tag names), empty if none. */
  refs: string[];
}

/** Commit with simple left-to-right lane layout for high-density UI. */
export interface GraphCommit extends GraphCommitRaw {
  /** 0-based lane index for this row. */
  lane: number;
  /**
   * Fixed-width ASCII topology prefix for the row (e.g. `* | |`).
   * Pure presentation aid; not full git --graph fidelity.
   */
  graph: string;
}

export interface GraphLogOptions {
  /** Max commits (default 200, clamped to MAX_GRAPH_LIMIT). */
  limit?: number;
  /**
   * When true (default), include all refs (`--all`).
   * When false, walk only HEAD ancestry.
   */
  all?: boolean;
  /**
   * Skip the first N commits (`git log --skip`). Used for paged loads past the
   * first window (P18). Clamped to ≥ 0.
   */
  skip?: number;
}

/** Paged graph result for incremental webview loads (P18). */
export interface GraphLogPage {
  commits: GraphCommit[];
  /** Absolute skip used for this page. */
  skip: number;
  /** Requested page size (after clamp). */
  limit: number;
  /** True when the page was full (caller may request skip+limit next). */
  hasMore: boolean;
}

/**
 * Format: sha \0 parents \0 author \0 author-time \0 subject \0 decorations
 * Parents are space-separated full SHAs (`%P`).
 */
export const GRAPH_LOG_FORMAT = "%H%x00%P%x00%an%x00%at%x00%s%x00%D";

export class GraphApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * Recent commits with parents + refs for graph UI.
   * Performance bound: default 200, max 500 commits **per page**.
   * Use `skip` (or `logPage`) to walk further history incrementally.
   */
  async log(options: GraphLogOptions = {}): Promise<GraphCommit[]> {
    const page = await this.logPage(options);
    return page.commits;
  }

  /**
   * Paged graph walk for webview incremental load (P18).
   * `hasMore` is true when this page returned a full `limit` rows.
   */
  async logPage(options: GraphLogOptions = {}): Promise<GraphLogPage> {
    const limit = clampGraphLimit(options.limit);
    const skip = clampSkip(options.skip);
    const all = options.all !== false;
    const args = ["log", `-n${limit}`, `--format=${GRAPH_LOG_FORMAT}`];
    if (skip > 0) args.push(`--skip=${skip}`);
    if (all) args.push("--all");
    const result = await this.repo.exec(args);
    const raw = parseGraphLog(result.stdout);
    const commits = layoutGraph(raw);
    return {
      commits,
      skip,
      limit,
      hasMore: commits.length >= limit,
    };
  }
}

function clampSkip(skip: number | undefined): number {
  if (skip == null || !Number.isFinite(skip) || skip <= 0) return 0;
  return Math.min(Math.floor(skip), 1_000_000);
}

export function clampGraphLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return DEFAULT_GRAPH_LIMIT;
  return Math.min(Math.floor(limit), MAX_GRAPH_LIMIT);
}

export function parseGraphLog(stdout: string): GraphCommitRaw[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];
  const out: GraphCommitRaw[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const parts = line.split("\0");
    if (parts.length < 5) continue;
    const [sha, parentsRaw, author, timeRaw, subject, ...decorParts] = parts;
    if (!sha || !/^[0-9a-f]{7,64}$/i.test(sha)) continue;
    const parents = (parentsRaw ?? "")
      .split(/\s+/)
      .map((p) => p.trim())
      .filter((p) => /^[0-9a-f]{7,64}$/i.test(p));
    const authorTime = Number(timeRaw);
    const decor = (decorParts.join("\0") || "").trim();
    const refs = parseDecorations(decor);
    out.push({
      sha,
      parents,
      author: author ?? "",
      authorTime: Number.isFinite(authorTime) ? authorTime : 0,
      subject: subject ?? "",
      refs,
    });
  }
  return out;
}

/** Parse git `%D` decorations into short ref names. */
export function parseDecorations(decor: string): string[] {
  if (!decor.trim()) return [];
  // e.g. HEAD -> main, origin/main, tag: v1.0
  return decor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s.startsWith("tag: ")) return s.slice(5).trim();
      if (s.startsWith("HEAD -> ")) return s.slice(8).trim();
      return s;
    })
    .filter(Boolean);
}

/**
 * Assign lanes for a newest-first commit list (simple first-parent continuing lanes).
 * Not a full git --graph emulation; enough topology for a high-density tree.
 */
export function layoutGraph(commits: GraphCommitRaw[]): GraphCommit[] {
  const laneOf = new Map<string, number>();
  let laneCount = 0;
  const out: GraphCommit[] = [];

  for (const c of commits) {
    let lane = laneOf.get(c.sha);
    if (lane === undefined) {
      lane = laneCount;
      laneCount += 1;
    }
    laneOf.delete(c.sha);

    if (c.parents[0]) {
      if (!laneOf.has(c.parents[0])) {
        laneOf.set(c.parents[0], lane);
      }
    }
    for (let i = 1; i < c.parents.length; i++) {
      const p = c.parents[i]!;
      if (!laneOf.has(p)) {
        laneOf.set(p, laneCount);
        laneCount += 1;
      }
    }

    // Cap visual width for UI density
    const width = Math.min(Math.max(laneCount, lane + 1), 12);
    const graph = renderGraphPrefix(lane, width, c.parents.length > 1);
    out.push({ ...c, lane, graph });
  }
  return out;
}

export function renderGraphPrefix(lane: number, width: number, isMerge: boolean): string {
  const cells: string[] = [];
  for (let i = 0; i < width; i++) {
    if (i === lane) cells.push(isMerge ? "M" : "*");
    else cells.push("|");
  }
  return cells.join(" ");
}
