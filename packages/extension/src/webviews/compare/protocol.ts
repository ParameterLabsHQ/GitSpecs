export interface CompareFileDto {
  status: string;
  path: string;
  oldPath?: string;
}

export interface CompareDataDto {
  base: string;
  head: string;
  ahead: number;
  behind: number;
  shortstat: string;
  againstWorkingTree: boolean;
  files: CompareFileDto[];
  repoRoot: string;
}

export type CompareHostMessage =
  | { type: "cmp:data"; payload: CompareDataDto }
  | { type: "cmp:error"; payload: { message: string } };

export type CompareClientMessage =
  | { type: "cmp:ready" }
  | { type: "cmp:openFile"; payload: { path: string } };

export function isCompareClientMessage(msg: unknown): msg is CompareClientMessage {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return t === "cmp:ready" || t === "cmp:openFile";
}

export function formatCompareHeader(d: CompareDataDto): string {
  const side = d.againstWorkingTree ? `${d.base} → Working Tree` : `${d.base}...${d.head}`;
  return `${side} · ↑${d.ahead} ↓${d.behind} · ${d.shortstat || "no changes"}`;
}
