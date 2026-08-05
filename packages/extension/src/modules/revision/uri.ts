import * as vscode from "vscode";
import {
  encodeRevisionUriParts,
  decodeRevisionUriParts,
  REVISION_SCHEME,
  type RevisionUriParts,
} from "./uriParts.js";

export {
  REVISION_SCHEME,
  encodeRevisionUriParts,
  decodeRevisionUriParts,
  revisionDocumentTitle,
  revisionDiffTitle,
  type RevisionUriParts,
  type RevisionUriRaw,
} from "./uriParts.js";

/**
 * Build a read-only `gitspecs:` URI for `path` at `rev` in `root`.
 *
 * Form: `gitspecs:/<repo-relative-path>?rev=<sha>&root=<encoded-root>`
 */
export function toRevisionUri(root: string, filePath: string, rev: string): vscode.Uri {
  const raw = encodeRevisionUriParts(root, filePath, rev);
  return vscode.Uri.from({
    scheme: REVISION_SCHEME,
    path: raw.path,
    query: raw.query,
  });
}

/** Parse a `gitspecs:` revision URI. Returns undefined if not a revision document. */
export function parseRevisionUri(uri: vscode.Uri): RevisionUriParts | undefined {
  if (uri.scheme !== REVISION_SCHEME) return undefined;
  return decodeRevisionUriParts(uri.path, uri.query);
}
