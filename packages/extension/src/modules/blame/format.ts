import type { BlameLine } from "@gitspecs/git-core";
import { formatBlameAnnotation } from "@gitspecs/git-core";
import {
  applyAutolinksMarkdown,
  type AutolinkRule,
} from "../autolinks/format.js";

/** Re-export library formatter so the extension uses the shipped function. */
export function formatLineBlame(line: BlameLine): string {
  return formatBlameAnnotation(line);
}

export function formatBlameHover(line: BlameLine): string {
  const date =
    line.authorTime != null
      ? new Date(line.authorTime * 1000).toISOString()
      : "(unknown time)";
  return [
    `**${line.author || "unknown"}** \`${line.sha.slice(0, 7)}\``,
    line.summary ? `*${line.summary}*` : undefined,
    date,
    line.authorMail ? line.authorMail : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Human-readable relative time from unix seconds.
 * Pure — pass `nowMs` in tests for deterministic output.
 */
export function formatRelativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 minute ago";
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 45) return `${minutes} minutes ago`;
  if (minutes < 90) return "1 hour ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 45) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 18) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function formatAbsoluteDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export interface StatusBarBlameOptions {
  /** Absolute "now" for relative dates (ms). Defaults to Date.now(). */
  nowMs?: number;
  /** Prefer relative dates (default true). */
  relative?: boolean;
}

/**
 * Compact status-bar text: author • relative/absolute date • short sha.
 */
export function formatStatusBarBlame(
  line: BlameLine,
  options: StatusBarBlameOptions = {},
): string {
  const relative = options.relative !== false;
  const nowMs = options.nowMs ?? Date.now();
  const author = line.author || "unknown";
  const shortSha = line.sha.slice(0, 7);
  let when = "";
  if (line.authorTime != null) {
    when = relative
      ? formatRelativeTime(line.authorTime, nowMs)
      : formatAbsoluteDate(line.authorTime);
  }
  return [author, when, shortSha].filter(Boolean).join(" • ");
}

/**
 * Unique author count title for file-level CodeLens, e.g. "3 authors".
 * Returns undefined when there is no authorship data.
 */
export function formatCodeLensAuthors(rows: BlameLine[]): string | undefined {
  if (rows.length === 0) return undefined;
  const authors = new Set(
    rows.map((r) => (r.author || "unknown").trim()).filter(Boolean),
  );
  const n = authors.size;
  if (n === 0) return undefined;
  return n === 1 ? "1 author" : `${n} authors`;
}

/**
 * "last change: subject (author, date)" from the most recent blamed commit.
 */
export function formatCodeLensLastChange(
  rows: BlameLine[],
  options: { nowMs?: number; relative?: boolean } = {},
): string | undefined {
  if (rows.length === 0) return undefined;

  // Prefer unique commits; pick the one with the latest authorTime.
  const bySha = new Map<string, BlameLine>();
  for (const r of rows) {
    const prev = bySha.get(r.sha);
    if (!prev) {
      bySha.set(r.sha, r);
      continue;
    }
    if ((r.authorTime ?? 0) > (prev.authorTime ?? 0)) {
      bySha.set(r.sha, r);
    }
  }

  let latest: BlameLine | undefined;
  for (const r of bySha.values()) {
    if (!latest) {
      latest = r;
      continue;
    }
    if ((r.authorTime ?? 0) > (latest.authorTime ?? 0)) {
      latest = r;
    }
  }
  if (!latest) return undefined;

  const subject = (latest.summary ?? "").trim() || "(no subject)";
  const author = latest.author || "unknown";
  let date = "";
  if (latest.authorTime != null) {
    date =
      options.relative === false
        ? formatAbsoluteDate(latest.authorTime)
        : formatRelativeTime(latest.authorTime, options.nowMs ?? Date.now());
  }
  const whoWhen = date ? `${author}, ${date}` : author;
  return `last change: ${subject} (${whoWhen})`;
}

/**
 * Richer hover markdown for decorations (P3 enrichment).
 * Includes relative time when authorTime is present.
 * Optional `autolinkRules` linkifies issue keys in the commit summary (P16).
 */
export function formatEnrichedBlameHover(
  line: BlameLine,
  options: {
    nowMs?: number;
    autolinkRules?: AutolinkRule[];
  } = {},
): string {
  const relative =
    line.authorTime != null
      ? formatRelativeTime(line.authorTime, options.nowMs ?? Date.now())
      : undefined;
  const absolute =
    line.authorTime != null
      ? new Date(line.authorTime * 1000).toISOString()
      : "(unknown time)";
  let summary = line.summary ? `*${line.summary}*` : undefined;
  if (line.summary && options.autolinkRules?.length) {
    const linked = applyAutolinksMarkdown(line.summary, options.autolinkRules);
    summary = `*${linked}*`;
  }
  return [
    `**${line.author || "unknown"}** \`${line.sha.slice(0, 7)}\``,
    summary,
    relative ? `${relative} (${absolute})` : absolute,
    line.authorMail ? line.authorMail : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
