/**
 * Protocol for interactive rebase sequence editor (P19).
 */

export type RebaseAction =
  | "pick"
  | "reword"
  | "edit"
  | "squash"
  | "fixup"
  | "drop";

export interface RebaseRowDto {
  action: RebaseAction;
  sha?: string;
  subject: string;
  isComment: boolean;
  raw: string;
}

export type RebaseHostMessage =
  | { type: "rebase:load"; payload: { rows: RebaseRowDto[]; onto: string } }
  | { type: "rebase:error"; payload: { message: string } }
  | { type: "rebase:done"; payload?: undefined };

export type RebaseClientMessage =
  | { type: "rebase:ready"; payload?: undefined }
  | { type: "rebase:apply"; payload: { rows: RebaseRowDto[] } }
  | { type: "rebase:abort"; payload?: undefined };

export function isRebaseClientMessage(msg: unknown): msg is RebaseClientMessage {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return t === "rebase:ready" || t === "rebase:apply" || t === "rebase:abort";
}

export const REBASE_ACTIONS: RebaseAction[] = [
  "pick",
  "reword",
  "edit",
  "squash",
  "fixup",
  "drop",
];
