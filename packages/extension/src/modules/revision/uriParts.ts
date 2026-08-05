import path from "node:path";

/** Virtual document scheme for file content at a Git revision. */
export const REVISION_SCHEME = "gitspecs";

export interface RevisionUriParts {
  /** Absolute repository root. */
  root: string;
  /** Repo-relative path (posix-style). */
  path: string;
  /** Full or short commit SHA / ref. */
  rev: string;
}

/** Pure path + query pieces for a revision document (no vscode). */
export interface RevisionUriRaw {
  path: string;
  query: string;
}

/**
 * Encode root/path/rev into path+query for a `gitspecs:` URI.
 * Pure — unit-tested without the extension host.
 */
export function encodeRevisionUriParts(
  root: string,
  filePath: string,
  rev: string,
): RevisionUriRaw {
  const rel = toPosixRel(root, filePath);
  return {
    path: "/" + rel.split("/").map(encodeURIComponent).join("/"),
    query: `rev=${encodeURIComponent(rev)}&root=${encodeURIComponent(root)}`,
  };
}

/**
 * Decode path+query from a `gitspecs:` URI.
 * Pure — unit-tested without the extension host.
 */
export function decodeRevisionUriParts(
  uriPath: string,
  query: string,
): RevisionUriParts | undefined {
  const params = new URLSearchParams(query);
  const rev = params.get("rev")?.trim();
  const root = params.get("root")?.trim();
  if (!rev || !root) return undefined;

  const rawPath = uriPath.replace(/^\/+/, "");
  const filePath = rawPath
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
  if (!filePath) return undefined;

  return { root, path: filePath, rev };
}

/** Human-readable title for tab labels / diff titles. */
export function revisionDocumentTitle(filePath: string, rev: string): string {
  const base = path.posix.basename(filePath.replace(/\\/g, "/")) || filePath;
  const short = rev.length > 12 ? rev.slice(0, 7) : rev;
  return `${base} @ ${short}`;
}

/** Diff title for left/right sides of vscode.diff. */
export function revisionDiffTitle(
  filePath: string,
  leftLabel: string,
  rightLabel: string,
): string {
  const base = path.posix.basename(filePath.replace(/\\/g, "/")) || filePath;
  return `${base} (${leftLabel} ↔ ${rightLabel})`;
}

function toPosixRel(root: string, filePath: string): string {
  const normalizedRoot = path.resolve(root);
  const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  let rel = path.relative(normalizedRoot, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    // Treat as already repo-relative
    rel = filePath;
  }
  return rel.replace(/\\/g, "/").replace(/^\.\/+/, "");
}
