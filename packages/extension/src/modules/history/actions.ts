import { parseRemoteUrl, commitUrl } from "@gitspecs/host-urls";
import type { HistoryCommit } from "@gitspecs/git-core";

/** Serializable history commit for QuickPick / command args. */
export interface HistoryCommitItem {
  sha: string;
  subject: string;
  author: string;
  authorTime: number;
  /** Repo-relative or absolute path used for view-at-rev. */
  filePath: string;
}

export type HistoryActionId =
  | "copySha"
  | "openCommitUrl"
  | "viewAtRev"
  | "diffWithPrevious"
  | "diffWithWorking";

export interface HistoryAction {
  id: HistoryActionId;
  label: string;
}

/**
 * Build host commit URL when the remote URL parses; otherwise undefined.
 * Pure — no network I/O.
 */
export function resolveCommitUrl(
  remoteUrl: string | undefined,
  sha: string,
): string | undefined {
  if (!remoteUrl || !sha) return undefined;
  const identity = parseRemoteUrl(remoteUrl);
  if (!identity) return undefined;
  return commitUrl(identity, sha);
}

/** Actions available for a selected history commit. */
export function historyCommitActions(hasCommitUrl: boolean): HistoryAction[] {
  const actions: HistoryAction[] = [
    { id: "copySha", label: "Copy SHA" },
    { id: "viewAtRev", label: "View File at Revision" },
    { id: "diffWithPrevious", label: "Open Changes with Previous Revision" },
    { id: "diffWithWorking", label: "Open Changes with Working Tree" },
  ];
  if (hasCommitUrl) {
    actions.push({ id: "openCommitUrl", label: "Open Commit on Remote" });
  }
  return actions;
}

export function toHistoryCommitItem(
  commit: HistoryCommit,
  filePath: string,
): HistoryCommitItem {
  return {
    sha: commit.sha,
    subject: commit.subject,
    author: commit.author,
    authorTime: commit.authorTime,
    filePath,
  };
}

/** QuickPick label/description for a history commit (newest-first list). */
export function formatHistoryPickLabel(commit: HistoryCommit): {
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

/** Default limit for history QuickPick lists. */
export const DEFAULT_HISTORY_LIMIT = 100;
