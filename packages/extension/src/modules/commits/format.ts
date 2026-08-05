import type { HistoryCommit } from "@gitspecs/git-core";

/** Default max commits loaded into the Commits tree. */
export const DEFAULT_COMMITS_LIMIT = 100;

/**
 * Pure tree-row formatting for a commit (label / description / detail strings).
 * No vscode imports — unit-testable without the extension host.
 */
export function formatCommitTreeRow(commit: HistoryCommit): {
  label: string;
  description: string;
  tooltip: string;
} {
  const short = commit.sha.slice(0, 7);
  const subject = commit.subject || "(no subject)";
  const when =
    commit.authorTime > 0
      ? new Date(commit.authorTime * 1000).toISOString().slice(0, 10)
      : "";
  const description = [commit.author, when].filter(Boolean).join(" · ");
  const tooltip = [
    commit.sha,
    subject,
    commit.author,
    when ? `Author date: ${when}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    label: `${short}  ${subject}`,
    description,
    tooltip,
  };
}

/**
 * Truncate a commit subject for confirm dialogs / short status text.
 */
export function truncateSubject(subject: string, maxLen = 60): string {
  const s = subject.trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1))}…`;
}

export type CommitActionId = "copySha" | "checkout" | "createBranch" | "openRemote";

export interface CommitAction {
  id: CommitActionId;
  label: string;
}

/** Context / palette actions available for a selected commit. */
export function commitActions(hasRemoteUrl: boolean): CommitAction[] {
  const actions: CommitAction[] = [
    { id: "copySha", label: "Copy SHA" },
    { id: "checkout", label: "Checkout Commit (detached)" },
    { id: "createBranch", label: "Create Branch from Commit…" },
  ];
  if (hasRemoteUrl) {
    actions.push({ id: "openRemote", label: "Open Commit on Remote" });
  }
  return actions;
}
