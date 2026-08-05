/**
 * Pure helpers for autolink / hover enrichment from host issue metadata (P21).
 */

export interface IssueMeta {
  number: number;
  title: string;
  url: string;
  state?: string;
  body?: string;
}

/**
 * Append issue title to autolink markdown detail lines.
 * Input `matches` are already-linkified keys; `metaByNum` maps number → issue.
 */
export function enrichAutolinkMarkdown(
  text: string,
  matches: Array<{ text: string; num: string; url: string }>,
  metaByNum: Map<string, IssueMeta>,
): string {
  if (matches.length === 0) return text;
  let out = text;
  const lines: string[] = [];
  for (const m of matches) {
    const meta = metaByNum.get(m.num);
    if (meta?.title) {
      lines.push(`${m.text}: ${meta.title}${meta.state ? ` (${meta.state})` : ""}`);
      // Prefer titled markdown link in the body when the raw key appears.
      out = out.split(m.text).join(`[${m.text} ${meta.title}](${meta.url || m.url})`);
    }
  }
  if (lines.length === 0) return text;
  return `${out}\n\nIssues:\n${lines.join("\n")}`;
}

/** Format a short PR badge label for tree descriptions. */
export function formatPrBadge(prNumber: number | undefined): string | undefined {
  if (prNumber == null || !Number.isFinite(prNumber) || prNumber <= 0) return undefined;
  return `PR #${Math.floor(prNumber)}`;
}
