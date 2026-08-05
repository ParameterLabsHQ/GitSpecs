/**
 * Typed message protocol for the Commit Graph canvas (P18).
 * Pure — shared by host and client; unit-tested without vscode.
 */

export interface GraphRowDto {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  authorTime: number;
  subject: string;
  refs: string[];
  lane: number;
  graph: string;
}

export interface GraphPageDto {
  commits: GraphRowDto[];
  skip: number;
  limit: number;
  hasMore: boolean;
  /** Working-tree dirty summary when available. */
  wip?: { dirty: boolean; summary?: string };
  repoRoot: string;
}

/** Host → client */
export type GraphHostMessage =
  | { type: "graph:page"; payload: GraphPageDto }
  | { type: "graph:append"; payload: GraphPageDto }
  | { type: "graph:error"; payload: { message: string } }
  | { type: "graph:ready"; payload?: undefined };

/** Client → host */
export type GraphClientMessage =
  | { type: "graph:ready"; payload?: undefined }
  | { type: "graph:requestPage"; payload: { skip: number; limit: number; filter?: string } }
  | {
      type: "graph:action";
      payload: {
        action: "copySha" | "checkout" | "createBranch" | "compare" | "openRemote";
        sha: string;
      };
    }
  | { type: "graph:select"; payload: { sha: string } };

export function isGraphClientMessage(msg: unknown): msg is GraphClientMessage {
  if (!msg || typeof msg !== "object") return false;
  const type = (msg as { type?: unknown }).type;
  return (
    type === "graph:ready" ||
    type === "graph:requestPage" ||
    type === "graph:action" ||
    type === "graph:select"
  );
}

/** Client-side filter (pure) — message/author/SHA substring, case-insensitive. */
export function filterGraphRows(rows: GraphRowDto[], query: string): GraphRowDto[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.sha.toLowerCase().includes(q) ||
      r.shortSha.toLowerCase().includes(q) ||
      r.subject.toLowerCase().includes(q) ||
      r.author.toLowerCase().includes(q) ||
      r.refs.some((ref) => ref.toLowerCase().includes(q)),
  );
}

export function toGraphRowDto(node: {
  sha: string;
  parents: string[];
  author: string;
  authorTime: number;
  subject: string;
  refs: string[];
  lane: number;
  graph: string;
}): GraphRowDto {
  return {
    sha: node.sha,
    shortSha: node.sha.slice(0, 7),
    parents: node.parents,
    author: node.author,
    authorTime: node.authorTime,
    subject: node.subject,
    refs: node.refs,
    lane: node.lane,
    graph: node.graph,
  };
}
