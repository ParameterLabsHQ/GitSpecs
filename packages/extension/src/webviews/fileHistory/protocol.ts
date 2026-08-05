export interface ChurnPointDto {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  authorTime: number;
  additions: number;
  deletions: number;
}

export type FileHistoryHostMessage =
  | { type: "fh:data"; payload: { path: string; points: ChurnPointDto[] } }
  | { type: "fh:error"; payload: { message: string } };

export type FileHistoryClientMessage =
  | { type: "fh:ready" }
  | { type: "fh:open"; payload: { sha: string } };

export function isFileHistoryClientMessage(msg: unknown): msg is FileHistoryClientMessage {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return t === "fh:ready" || t === "fh:open";
}

/** Scale mark height 4–40px from churn total. */
export function churnMarkHeight(additions: number, deletions: number, maxChurn: number): number {
  const c = Math.max(0, additions + deletions);
  if (maxChurn <= 0) return 8;
  return Math.max(4, Math.round((c / maxChurn) * 40));
}
