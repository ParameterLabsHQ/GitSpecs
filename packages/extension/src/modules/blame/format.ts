import type { BlameLine } from "@gitspecs/git-core";
import { formatBlameAnnotation } from "@gitspecs/git-core";

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
