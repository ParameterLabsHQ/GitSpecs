import type { BlameLine } from "@gitspecs/git-core";
import {
  formatCodeLensAuthors,
  formatCodeLensLastChange,
} from "./format.js";
import { toDetailPayload, type BlameDetailPayload } from "./detail.js";

/**
 * Whether an in-flight CodeLens result should be applied.
 * Per-document only: cancellation or a newer document.version supersedes;
 * concurrent provideCodeLenses for *other* files must not discard this result
 * (no global sequence counter).
 */
export function shouldAcceptCodeLensResult(options: {
  cancelled: boolean;
  requestedVersion: number;
  currentVersion: number;
}): boolean {
  if (options.cancelled) return false;
  if (options.currentVersion !== options.requestedVersion) return false;
  return true;
}

export interface FileCodeLensSpec {
  title: string;
  tooltip: string;
  payload?: BlameDetailPayload;
  /**
   * 0-based start line for the lens anchor. File-level uses 0; symbol-level
   * uses the symbol's start line.
   */
  line?: number;
}

/** Pure 0-based line range for a top-level symbol (inclusive start, exclusive end line). */
export interface SymbolLineRange {
  /** Display name (function/class/etc.). */
  name: string;
  /** 0-based start line. */
  startLine: number;
  /** 0-based end line (inclusive). */
  endLine: number;
}

/** Pure builder for file-level CodeLens titles + detail payloads from blame rows. */
export function buildFileCodeLensSpecs(rows: BlameLine[]): FileCodeLensSpec[] {
  if (rows.length === 0) return [];
  const latest = pickLatest(rows);
  const payload = latest ? toDetailPayload(latest) : undefined;
  const specs: FileCodeLensSpec[] = [];

  const authorsTitle = formatCodeLensAuthors(rows);
  if (authorsTitle) {
    specs.push({
      title: authorsTitle,
      tooltip: "GitSpecs: file authors",
      payload,
      line: 0,
    });
  }

  const lastChange = formatCodeLensLastChange(rows);
  if (lastChange) {
    specs.push({
      title: lastChange,
      tooltip: "GitSpecs: last change",
      payload,
      line: 0,
    });
  }

  return specs;
}

/**
 * Filter blame rows to a 0-based inclusive line range (document coordinates).
 * Blame line numbers are 1-based.
 */
export function blameRowsForLineRange(
  rows: BlameLine[],
  startLine0: number,
  endLine0: number,
): BlameLine[] {
  const start1 = startLine0 + 1;
  const end1 = endLine0 + 1;
  return rows.filter((r) => r.lineNumber >= start1 && r.lineNumber <= end1);
}

/**
 * Symbol-level CodeLens: for each top-level symbol range, emit author count +
 * last-change lenses anchored at the symbol start line. Skips symbols that
 * share line 0 with the file-level lenses when they would fully duplicate the
 * whole-file set (single-symbol file still gets symbol lenses only if the
 * range is a proper subset — callers typically pass all top-level symbols).
 */
export function buildSymbolCodeLensSpecs(
  rows: BlameLine[],
  symbols: SymbolLineRange[],
): FileCodeLensSpec[] {
  if (rows.length === 0 || symbols.length === 0) return [];
  const specs: FileCodeLensSpec[] = [];

  for (const sym of symbols) {
    if (sym.startLine < 0 || sym.endLine < sym.startLine) continue;
    const subset = blameRowsForLineRange(rows, sym.startLine, sym.endLine);
    if (subset.length === 0) continue;

    const latest = pickLatest(subset);
    const payload = latest ? toDetailPayload(latest) : undefined;
    const authorsTitle = formatCodeLensAuthors(subset);
    if (authorsTitle) {
      specs.push({
        title: `${authorsTitle} — ${sym.name}`,
        tooltip: `GitSpecs: authors in ${sym.name}`,
        payload,
        line: sym.startLine,
      });
    }
    const lastChange = formatCodeLensLastChange(subset);
    if (lastChange) {
      specs.push({
        title: lastChange,
        tooltip: `GitSpecs: last change in ${sym.name}`,
        payload,
        line: sym.startLine,
      });
    }
  }

  return specs;
}

/**
 * Keep only top-level document symbols (no parent). When the API returns a
 * tree, flatten to roots only.
 */
export function topLevelSymbolRanges(
  symbols: ReadonlyArray<{
    name: string;
    range: { start: { line: number }; end: { line: number } };
    children?: ReadonlyArray<unknown>;
  }>,
): SymbolLineRange[] {
  return symbols.map((s) => ({
    name: s.name || "(symbol)",
    startLine: s.range.start.line,
    endLine: s.range.end.line,
  }));
}

function pickLatest(rows: BlameLine[]): BlameLine | undefined {
  let latest: BlameLine | undefined;
  for (const r of rows) {
    if (!latest || (r.authorTime ?? 0) > (latest.authorTime ?? 0)) {
      latest = r;
    }
  }
  return latest;
}
