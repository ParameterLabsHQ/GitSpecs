import type { StashInfo } from "@gitspecs/git-core";

/**
 * Pure tree-row formatting for a stash entry.
 * No vscode imports — unit-testable without the extension host.
 */
export function formatStashTreeRow(stash: StashInfo): {
  label: string;
  description: string;
  tooltip: string;
} {
  const short = stash.sha.slice(0, 7);
  const message = stash.message || "(no message)";
  const when =
    stash.authorTime > 0
      ? new Date(stash.authorTime * 1000).toISOString().slice(0, 10)
      : "";
  return {
    label: `${stash.ref}  ${message}`,
    description: [short, when].filter(Boolean).join(" · "),
    tooltip: [stash.ref, stash.sha, message, when ? `Date: ${when}` : undefined]
      .filter(Boolean)
      .join("\n"),
  };
}
