/**
 * Pure multi-action blame hover builders (True Clone / P24b).
 * No vscode imports — controller wraps results in MarkdownString.
 */
import type { BlameLine } from "@gitspecs/git-core";
import {
  applyAutolinksMarkdown,
  type AutolinkRule,
} from "../autolinks/format.js";
import { formatAbsoluteDate, formatRelativeTime } from "./format.js";

export interface HoverActionLink {
  /** Visible label in markdown link */
  label: string;
  /** Full command URI, e.g. command:gitspecs.revision.diffWithPrevious */
  commandUri: string;
}

export interface DetailsHoverOptions {
  nowMs?: number;
  autolinkRules?: AutolinkRule[];
  /** Extra markdown block (e.g. issue titles). */
  enrichedBlock?: string;
  /** Action links rendered after the body. */
  actions?: HoverActionLink[];
  /** When true, use relative + absolute time. Default true. */
  relative?: boolean;
}

/**
 * Commit details hover with optional multi-action command links.
 */
export function formatDetailsHoverMarkdown(
  line: BlameLine,
  options: DetailsHoverOptions = {},
): string {
  const relative = options.relative !== false;
  const nowMs = options.nowMs ?? Date.now();
  const author = line.author || "unknown";
  const short = line.sha.slice(0, 7);

  let summary: string | undefined;
  if (line.summary) {
    const body = options.autolinkRules?.length
      ? applyAutolinksMarkdown(line.summary, options.autolinkRules)
      : line.summary;
    summary = `*${body}*`;
  }

  let when: string | undefined;
  if (line.authorTime != null) {
    const abs = formatAbsoluteDate(line.authorTime);
    when = relative
      ? `${formatRelativeTime(line.authorTime, nowMs)} (${abs})`
      : abs;
  }

  const parts = [
    `**${author}** \`${short}\``,
    summary,
    when,
    line.authorMail || undefined,
    options.enrichedBlock?.trim() || undefined,
  ].filter(Boolean) as string[];

  const actions = options.actions ?? [];
  if (actions.length > 0) {
    const links = actions
      .map((a) => `[${a.label}](${a.commandUri})`)
      .join(" · ");
    parts.push(links);
  }

  return parts.join("\n\n");
}

export interface ChangesHoverOptions {
  /** Previous version of the line (without trailing newline). */
  previousLine?: string;
  previousSha?: string;
  actions?: HoverActionLink[];
}

/**
 * Changes hover: previous line content + optional action links.
 */
export function formatChangesHoverMarkdown(
  line: BlameLine,
  options: ChangesHoverOptions = {},
): string {
  const short = line.sha.slice(0, 7);
  const prevSha = (options.previousSha ?? line.previousSha)?.slice(0, 7);
  const header = prevSha
    ? `**Changes** \`${prevSha}\` → \`${short}\``
    : `**Changes** for \`${short}\``;

  const parts: string[] = [header];

  if (options.previousLine != null && options.previousLine !== "") {
    const escaped = options.previousLine.replace(/```/g, "'''");
    parts.push("Previous line:", "```", escaped, "```");
  } else if (line.content) {
    parts.push("Current line:", "```", line.content.replace(/```/g, "'''"), "```");
  } else {
    parts.push("_No previous line content available._");
  }

  const actions = options.actions ?? [];
  if (actions.length > 0) {
    parts.push(actions.map((a) => `[${a.label}](${a.commandUri})`).join(" · "));
  }

  return parts.join("\n\n");
}

/**
 * Build a VS Code markdown command URI, optionally with JSON-encoded args.
 * Pure — no vscode dependency.
 */
export function commandUri(command: string, args?: unknown[]): string {
  if (!args || args.length === 0) return `command:${command}`;
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}

/**
 * Default action links for ambient / annotation blame hovers.
 * Labels match real command behavior (copy / open remote are not detail picks).
 */
export function defaultBlameHoverActions(options: {
  /** Full commit SHA for Copy SHA (required for the copy action). */
  sha?: string;
  /** Prebuilt commit URL for Open on Remote. */
  commitUrl?: string;
} = {}): HoverActionLink[] {
  const actions: HoverActionLink[] = [
    {
      label: "Open Changes",
      commandUri: commandUri("gitspecs.revision.diffWithPrevious"),
    },
    {
      label: "File History",
      commandUri: commandUri("gitspecs.history.file"),
    },
    {
      label: "Toggle File Blame",
      commandUri: commandUri("gitspecs.blame.toggleFile"),
    },
  ];
  if (options.sha) {
    actions.push({
      label: "Copy SHA",
      commandUri: commandUri("gitspecs.blame.copySha", [options.sha]),
    });
  }
  if (options.commitUrl) {
    actions.push({
      label: "Open on Remote",
      commandUri: commandUri("gitspecs.blame.openRemote", [options.commitUrl]),
    });
  }
  return actions;
}

/**
 * Merge details + changes sections for a combined hover when both enabled.
 */
export function formatCombinedBlameHoverMarkdown(
  line: BlameLine,
  options: DetailsHoverOptions & ChangesHoverOptions & {
    includeDetails?: boolean;
    includeChanges?: boolean;
  } = {},
): string {
  const includeDetails = options.includeDetails !== false;
  const includeChanges = options.includeChanges === true;
  const sections: string[] = [];
  if (includeDetails) {
    sections.push(formatDetailsHoverMarkdown(line, options));
  }
  if (includeChanges) {
    sections.push(formatChangesHoverMarkdown(line, options));
  }
  return sections.filter(Boolean).join("\n\n---\n\n");
}
