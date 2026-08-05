import { parseRemoteUrl, commitUrl } from "@gitspecs/host-urls";
import type { BlameLine } from "@gitspecs/git-core";

/** Serializable blame detail payload for commands / CodeLens args. */
export interface BlameDetailPayload {
  sha: string;
  author: string;
  summary?: string;
  authorTime?: number;
  authorMail?: string;
}

export type BlameDetailActionId = "showMessage" | "copySha" | "openCommitUrl";

export interface BlameDetailAction {
  id: BlameDetailActionId;
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

/** Quick-pick / action list for status-bar and CodeLens detail flows. */
export function blameDetailActions(hasCommitUrl: boolean): BlameDetailAction[] {
  const actions: BlameDetailAction[] = [
    { id: "showMessage", label: "Show Commit Message" },
    { id: "copySha", label: "Copy SHA" },
  ];
  if (hasCommitUrl) {
    actions.push({ id: "openCommitUrl", label: "Open Commit on Remote" });
  }
  return actions;
}

export function toDetailPayload(line: BlameLine): BlameDetailPayload {
  return {
    sha: line.sha,
    author: line.author || "unknown",
    summary: line.summary,
    authorTime: line.authorTime,
    authorMail: line.authorMail,
  };
}

/** Whether the status-bar item should be visible. */
export function shouldShowStatusBarBlame(
  settingEnabled: boolean,
  hasRepo: boolean,
  hasDiskFile: boolean,
  hasBlameLine: boolean,
): boolean {
  return settingEnabled && hasRepo && hasDiskFile && hasBlameLine;
}
