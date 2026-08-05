import type { BlameLine } from "@gitspecs/git-core";
import {
  formatCodeLensAuthors,
  formatCodeLensLastChange,
} from "./format.js";
import { toDetailPayload, type BlameDetailPayload } from "./detail.js";

/**
 * Whether an in-flight CodeLens result should be applied.
 * Per-document only: cancellation or a newer document.version supersedes;
 * concurrent provideCodeLenses for *other* files must not discard this result
 * (no global sequence counter).
 */
export function shouldAcceptCodeLensResult(options: {
  cancelled: boolean;
  requestedVersion: number;
  currentVersion: number;
}): boolean {
  if (options.cancelled) return false;
  if (options.currentVersion !== options.requestedVersion) return false;
  return true;
}

export interface FileCodeLensSpec {
  title: string;
  tooltip: string;
  payload?: BlameDetailPayload;
}

/** Pure builder for file-level CodeLens titles + detail payloads from blame rows. */
export function buildFileCodeLensSpecs(rows: BlameLine[]): FileCodeLensSpec[] {
  if (rows.length === 0) return [];
  const latest = pickLatest(rows);
  const payload = latest ? toDetailPayload(latest) : undefined;
  const specs: FileCodeLensSpec[] = [];

  const authorsTitle = formatCodeLensAuthors(rows);
  if (authorsTitle) {
    specs.push({
      title: authorsTitle,
      tooltip: "GitSpecs: file authors",
      payload,
    });
  }

  const lastChange = formatCodeLensLastChange(rows);
  if (lastChange) {
    specs.push({
      title: lastChange,
      tooltip: "GitSpecs: last change",
      payload,
    });
  }

  return specs;
}

function pickLatest(rows: BlameLine[]): BlameLine | undefined {
  let latest: BlameLine | undefined;
  for (const r of rows) {
    if (!latest || (r.authorTime ?? 0) > (latest.authorTime ?? 0)) {
      latest = r;
    }
  }
  return latest;
}
