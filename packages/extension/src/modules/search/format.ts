import type { HistoryCommit } from "@gitspecs/git-core";

export type SearchActionId = "copySha" | "openCommitUrl";

export interface SearchAction {
  id: SearchActionId;
  label: string;
}

/** Actions for a commit found via search (no view-at-rev without a file path). */
export function searchCommitActions(hasCommitUrl: boolean): SearchAction[] {
  const actions: SearchAction[] = [{ id: "copySha", label: "Copy SHA" }];
  if (hasCommitUrl) {
    actions.push({ id: "openCommitUrl", label: "Open Commit on Remote" });
  }
  return actions;
}

/** QuickPick label for a search hit (reuses history-style layout). */
export function formatSearchPickLabel(commit: HistoryCommit): {
  label: string;
  description: string;
  detail: string;
} {
  const short = commit.sha.slice(0, 7);
  const when =
    commit.authorTime > 0
      ? new Date(commit.authorTime * 1000).toISOString().slice(0, 10)
      : "";
  return {
    label: `$(git-commit) ${short}  ${commit.subject || "(no subject)"}`,
    description: commit.author,
    detail: when,
  };
}

export const DEFAULT_SEARCH_LIMIT = 100;

/**
 * Normalize user search inputs. Returns undefined if both empty after trim
 * (caller should abort). Pure helper for tests.
 */
export function normalizeSearchQuery(
  grep: string | undefined,
  author: string | undefined,
): { grep?: string; author?: string } | undefined {
  const g = grep?.trim() ?? "";
  const a = author?.trim() ?? "";
  if (!g && !a) return undefined;
  return {
    grep: g || undefined,
    author: a || undefined,
  };
}
