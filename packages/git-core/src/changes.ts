import type { GitRepository } from "./repository.js";
import { toRepoRelative } from "./blame.js";
import { GitCommandError } from "./errors.js";

/** Kind of line-level change annotation. */
export type ChangeLineKind = "working" | "unpushed";

/**
 * Inclusive 1-based line range that differs in the "new" side of a unified diff.
 * Deletion-only hunks (new count 0) are omitted — they do not mark working-tree lines.
 */
export interface ChangedLineRange {
  /** 1-based start line in the current / new file (inclusive). */
  startLine: number;
  /** 1-based end line in the current / new file (inclusive). */
  endLine: number;
  kind: ChangeLineKind;
}

export interface ChangedLinesOptions {
  /**
   * When true (default), include uncommitted changes vs HEAD
   * (`git diff -U0 HEAD -- path`).
   */
  workingTree?: boolean;
  /**
   * When true (default), include lines changed in commits not yet on the
   * upstream (`git diff -U0 @{upstream}...HEAD -- path`). Silently skipped
   * when there is no upstream.
   */
  unpushed?: boolean;
}

/**
 * Parse unified-diff hunk headers and return **new-file** line ranges.
 *
 * Accepts full `git diff` / `git show` unified output; ignores file headers
 * and hunk body lines. Empty input → empty array.
 *
 * Hunk header forms supported:
 * - `@@ -l,s +l,s @@`
 * - `@@ -l +l @@` (counts default to 1)
 * - `@@ -l,s +l @@` / `@@ -l +l,s @@`
 */
export function parseUnifiedDiffHunks(
  stdout: string,
  kind: ChangeLineKind = "working",
): ChangedLineRange[] {
  const text = stdout.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  const ranges: ChangedLineRange[] = [];
  // Match @@ -oldStart[,oldCount] +newStart[,newCount] @@
  const re = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const newStart = Number(m[3]);
    const newCount = m[4] != null ? Number(m[4]) : 1;
    if (!Number.isFinite(newStart) || newStart < 0) continue;
    if (!Number.isFinite(newCount) || newCount <= 0) continue;
    // newStart 0 appears for pure creates in some edge diffs; treat as line 1.
    const startLine = Math.max(1, newStart);
    const endLine = startLine + newCount - 1;
    ranges.push({ startLine, endLine, kind });
  }
  return mergeAdjacentRanges(ranges);
}

/** Merge overlapping/adjacent ranges of the same kind (keeps decoration sparse). */
export function mergeAdjacentRanges(ranges: ChangedLineRange[]): ChangedLineRange[] {
  if (ranges.length === 0) return [];
  const byKind = new Map<ChangeLineKind, ChangedLineRange[]>();
  for (const r of ranges) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  const out: ChangedLineRange[] = [];
  for (const [kind, list] of byKind) {
    list.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
    let cur = { ...list[0]! };
    for (let i = 1; i < list.length; i++) {
      const n = list[i]!;
      if (n.startLine <= cur.endLine + 1) {
        cur.endLine = Math.max(cur.endLine, n.endLine);
      } else {
        out.push(cur);
        cur = { ...n };
      }
    }
    out.push({ ...cur, kind });
  }
  out.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  return out;
}

/** Expand ranges to a set of 1-based line numbers. */
export function expandChangedLines(ranges: ChangedLineRange[]): Set<number> {
  const lines = new Set<number>();
  for (const r of ranges) {
    for (let ln = r.startLine; ln <= r.endLine; ln++) {
      lines.add(ln);
    }
  }
  return lines;
}

export class ChangesApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * Line ranges changed in the working tree and/or unpushed commits for `path`.
   * Uses `git diff -U0` (no context) for precise hunk boundaries.
   */
  async changedLines(
    path: string,
    options: ChangedLinesOptions = {},
  ): Promise<ChangedLineRange[]> {
    const rel = toRepoRelative(this.repo.root, path);
    const wantWorking = options.workingTree !== false;
    const wantUnpushed = options.unpushed !== false;
    const ranges: ChangedLineRange[] = [];

    if (wantWorking) {
      // HEAD → worktree (staged + unstaged)
      const result = await this.repo.exec(["diff", "-U0", "HEAD", "--", rel], {
        allowFailure: true,
      });
      if (result.code === 0 || result.stdout) {
        ranges.push(...parseUnifiedDiffHunks(result.stdout, "working"));
      }
    }

    if (wantUnpushed) {
      const upstream = await this.resolveUpstream();
      if (upstream) {
        try {
          const result = await this.repo.exec(
            ["diff", "-U0", `${upstream}...HEAD`, "--", rel],
            { allowFailure: true },
          );
          if (result.code === 0 || result.stdout) {
            ranges.push(...parseUnifiedDiffHunks(result.stdout, "unpushed"));
          }
        } catch (err) {
          if (!(err instanceof GitCommandError)) throw err;
        }
      }
    }

    return mergeAdjacentRanges(ranges);
  }

  /**
   * Current branch upstream short name (e.g. `origin/main`), or undefined.
   */
  async resolveUpstream(): Promise<string | undefined> {
    const result = await this.repo.exec(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { allowFailure: true },
    );
    if (result.code !== 0) return undefined;
    const name = result.stdout.trim();
    return name || undefined;
  }
}
