import { parseRemoteUrl, compareUrl } from "@gitspecs/host-urls";
import type { CompareResult, NameStatusEntry } from "@gitspecs/git-core";

export type CompareActionId = "openHostCompare" | "copySummary" | "showOutput" | "copyPath";

export interface CompareActionItem {
  kind: "action";
  id: CompareActionId;
  label: string;
  description?: string;
}

export interface CompareFileItem {
  kind: "file";
  label: string;
  description: string;
  detail?: string;
  path: string;
  status: string;
}

export type ComparePickItem = CompareActionItem | CompareFileItem;

/** Human-readable one-line summary of a compare result. */
export function formatCompareSummary(result: CompareResult): string {
  const headLabel = result.againstWorkingTree ? "Working Tree" : result.head;
  const range = `${result.base}…${headLabel}`;
  const ab = `ahead ${result.ahead}, behind ${result.behind}`;
  const stat = result.shortstat ? ` — ${result.shortstat}` : "";
  const fileCount =
    result.files.length === 1 ? "1 file" : `${result.files.length} files`;
  return `Compare ${range}: ${ab}${stat} (${fileCount})`;
}

/** QuickPick label for a name-status entry. */
export function formatNameStatusLabel(entry: NameStatusEntry): {
  label: string;
  description: string;
  detail?: string;
} {
  const status = entry.status;
  const icon =
    status.startsWith("A")
      ? "$(diff-added)"
      : status.startsWith("D")
        ? "$(diff-removed)"
        : status.startsWith("R") || status.startsWith("C")
          ? "$(diff-renamed)"
          : "$(diff-modified)";
  const label = `${icon} ${entry.path}`;
  const description = status;
  const detail =
    entry.oldPath && entry.oldPath !== entry.path
      ? `from ${entry.oldPath}`
      : undefined;
  return { label, description, detail };
}

/**
 * Build host compare URL when the remote parses and both sides are refs
 * (not working tree). Pure — no network.
 */
export function resolveCompareUrl(
  remoteUrl: string | undefined,
  base: string,
  head: string,
  againstWorkingTree: boolean,
): string | undefined {
  if (againstWorkingTree || !remoteUrl || !base || !head) return undefined;
  if (head === "WORKING_TREE") return undefined;
  const identity = parseRemoteUrl(remoteUrl);
  if (!identity) return undefined;
  // Strip known remote prefixes for host URLs (origin/foo → foo).
  // Local names like feature/foo are left intact (only listed remotes strip).
  const cleanBase = stripRemotePrefix(base);
  const cleanHead = stripRemotePrefix(head);
  return compareUrl(identity, cleanBase, cleanHead);
}

/**
 * Strip a known remote prefix (`origin/feature` → `feature`).
 * Local slashy names (`feature/foo`) are unchanged unless the first segment
 * matches a remote in `remotes` (default: `origin`).
 */
export function stripRemotePrefix(
  ref: string,
  remotes: readonly string[] = ["origin"],
): string {
  if (!ref.includes("/")) return ref;
  for (const remote of remotes) {
    const prefix = `${remote}/`;
    if (ref.startsWith(prefix) && ref.length > prefix.length) {
      return ref.slice(prefix.length);
    }
  }
  return ref;
}

/**
 * Build QuickPick rows: actions first, then changed files.
 * Pure helper for unit tests without the extension host.
 */
export function buildComparePickItems(
  result: CompareResult,
  options: { hasHostUrl: boolean },
): ComparePickItem[] {
  const items: ComparePickItem[] = [];

  if (options.hasHostUrl) {
    items.push({
      kind: "action",
      id: "openHostCompare",
      label: "$(globe) Open Host Compare URL",
      description: "Open base…head on the remote host",
    });
  }

  items.push(
    {
      kind: "action",
      id: "copySummary",
      label: "$(clippy) Copy Summary",
    },
    {
      kind: "action",
      id: "showOutput",
      label: "$(output) Show in Output",
      description: "Write full compare report to GitSpecs output",
    },
  );

  for (const file of result.files) {
    const labels = formatNameStatusLabel(file);
    items.push({
      kind: "file",
      label: labels.label,
      description: labels.description,
      detail: labels.detail,
      path: file.path,
      status: file.status,
    });
  }

  return items;
}

/** Multi-line report for the Output channel. */
export function formatCompareReport(result: CompareResult): string {
  const lines: string[] = [
    formatCompareSummary(result),
    "",
    "Changed files:",
  ];
  if (result.files.length === 0) {
    lines.push("  (none)");
  } else {
    for (const f of result.files) {
      const rename = f.oldPath ? ` (${f.oldPath} → ${f.path})` : "";
      lines.push(`  ${f.status.padEnd(5)} ${f.path}${rename}`);
    }
  }
  return lines.join("\n");
}
