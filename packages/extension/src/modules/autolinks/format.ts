/**
 * Config-driven issue/PR autolinks (P16).
 * Pure — no network. P21 may enrich tooltips with provider metadata.
 */

export interface AutolinkRule {
  /** Literal prefix matched before a number, e.g. `#`, `JIRA-`, `GH-`. */
  prefix: string;
  /**
   * URL template. The first `<num>` (or all) is replaced with the captured
   * digits. Example: `https://github.com/org/repo/issues/<num>`
   */
  url: string;
}

export interface AutolinkMatch {
  /** Full matched text including prefix, e.g. `#42` or `JIRA-123`. */
  text: string;
  /** Captured number as string. */
  num: string;
  /** Resolved URL after `<num>` substitution. */
  url: string;
  /** Start index in the source string. */
  start: number;
  /** End index (exclusive) in the source string. */
  end: number;
  rule: AutolinkRule;
}

/**
 * Normalize settings array into valid rules (non-empty prefix + url with path).
 */
export function normalizeAutolinkRules(raw: unknown): AutolinkRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: AutolinkRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const prefix = String((item as AutolinkRule).prefix ?? "").trim();
    const url = String((item as AutolinkRule).url ?? "").trim();
    if (!prefix || !url) continue;
    rules.push({ prefix, url });
  }
  return rules;
}

/**
 * Find all autolink matches in `text` for the given rules.
 * Longer prefixes are tried first to prefer `JIRA-` over `-` edge cases.
 * Non-overlapping: earlier (leftmost, then longer) wins.
 */
export function findAutolinks(text: string, rules: AutolinkRule[]): AutolinkMatch[] {
  if (!text || rules.length === 0) return [];

  const ordered = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
  const candidates: AutolinkMatch[] = [];

  for (const rule of ordered) {
    const escaped = escapeRegExp(rule.prefix);
    // Prefix then one or more digits. Word boundary after digits.
    // Allow prefix at start or after non-word / whitespace.
    const re = new RegExp(`(${escaped})(\\d+)\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const full = m[0]!;
      const num = m[2]!;
      const start = m.index;
      const end = start + full.length;
      const url = rule.url.split("<num>").join(num);
      candidates.push({ text: full, num, url, start, end, rule });
    }
  }

  // Resolve overlaps: sort by start, then longer match, greedy left-to-right.
  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const accepted: AutolinkMatch[] = [];
  let cursor = 0;
  for (const c of candidates) {
    if (c.start < cursor) continue;
    accepted.push(c);
    cursor = c.end;
  }
  return accepted;
}

/**
 * Replace matches in plain text with markdown links `[text](url)`.
 * Safe for hover markdown; does not HTML-escape (callers own that).
 */
export function applyAutolinksMarkdown(text: string, rules: AutolinkRule[]): string {
  const matches = findAutolinks(text, rules);
  if (matches.length === 0) return text;

  let out = "";
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start);
    out += `[${m.text}](${m.url})`;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * Append autolink lines to a multi-line tooltip / detail string when matches
 * exist. Keeps original text; adds `Autolinks: …` footer.
 */
export function appendAutolinkDetails(text: string, rules: AutolinkRule[]): string {
  const matches = findAutolinks(text, rules);
  if (matches.length === 0) return text;
  const lines = matches.map((m) => `${m.text} → ${m.url}`);
  return `${text}\n\nAutolinks:\n${lines.join("\n")}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
