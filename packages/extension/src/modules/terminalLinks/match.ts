/**
 * Pure matchers for terminal link detection (P16).
 * Extension host turns these into TerminalLink instances.
 */

export type TerminalLinkKind = "sha" | "ref";

export interface TerminalLinkHit {
  kind: TerminalLinkKind;
  /** Matched substring. */
  text: string;
  startIndex: number;
  length: number;
  /** Full SHA when kind is sha (may equal text if already full). */
  sha?: string;
  /** Branch/tag name when kind is ref. */
  ref?: string;
}

/** Full or abbreviated git object name (7–40 hex). */
const SHA_RE = /\b([0-9a-f]{7,40})\b/gi;

/**
 * Find SHA-like tokens in a terminal line.
 * When `knownShas` is provided, only SHAs that match a known prefix are kept
 * (avoids false positives on random hex). When omitted, all hex tokens of
 * length ≥ 7 are returned (caller may filter).
 */
export function findShaLinks(
  line: string,
  knownShas?: readonly string[],
): TerminalLinkHit[] {
  if (!line) return [];
  const hits: TerminalLinkHit[] = [];
  const re = new RegExp(SHA_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const text = m[1]!;
    const lower = text.toLowerCase();
    if (knownShas && knownShas.length > 0) {
      const full = knownShas.find(
        (s) => s.toLowerCase() === lower || s.toLowerCase().startsWith(lower),
      );
      if (!full) continue;
      hits.push({
        kind: "sha",
        text,
        startIndex: m.index,
        length: text.length,
        sha: full,
      });
    } else {
      hits.push({
        kind: "sha",
        text,
        startIndex: m.index,
        length: text.length,
        sha: text,
      });
    }
  }
  return hits;
}

/**
 * Find branch/tag names from `refNames` as whole-token matches in `line`.
 * Longer names win on overlap. Names shorter than 2 chars are ignored.
 */
export function findRefLinks(
  line: string,
  refNames: readonly string[],
): TerminalLinkHit[] {
  if (!line || refNames.length === 0) return [];
  const names = [...new Set(refNames)]
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length);

  const hits: TerminalLinkHit[] = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Token boundary: start/end or non-ref character.
    const re = new RegExp(`(?<![\\w./-])(${escaped})(?![\\w./-])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      hits.push({
        kind: "ref",
        text: m[1]!,
        startIndex: m.index,
        length: m[1]!.length,
        ref: name,
      });
    }
  }

  // Left-to-right non-overlapping
  hits.sort((a, b) => a.startIndex - b.startIndex || b.length - a.length);
  const accepted: TerminalLinkHit[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.startIndex < cursor) continue;
    accepted.push(h);
    cursor = h.startIndex + h.length;
  }
  return accepted;
}

/** Merge SHA + ref hits without overlap (SHA preferred on conflict). */
export function mergeTerminalHits(
  shas: TerminalLinkHit[],
  refs: TerminalLinkHit[],
): TerminalLinkHit[] {
  const all = [...shas, ...refs].sort(
    (a, b) => a.startIndex - b.startIndex || b.length - a.length,
  );
  const out: TerminalLinkHit[] = [];
  let cursor = 0;
  for (const h of all) {
    if (h.startIndex < cursor) continue;
    out.push(h);
    cursor = h.startIndex + h.length;
  }
  return out;
}
