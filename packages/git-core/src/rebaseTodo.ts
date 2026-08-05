/**
 * Parse / serialize `git-rebase-todo` (interactive rebase sequence).
 * Clean-room format interop with git's documented todo file.
 */

export type RebaseTodoAction =
  | "pick"
  | "reword"
  | "edit"
  | "squash"
  | "fixup"
  | "drop"
  | "break"
  | "exec"
  | "label"
  | "reset"
  | "merge"
  | "update-ref";

/** Short aliases git accepts (p, r, e, s, f, d, x, …). */
const ACTION_ALIASES: Record<string, RebaseTodoAction> = {
  p: "pick",
  pick: "pick",
  r: "reword",
  reword: "reword",
  e: "edit",
  edit: "edit",
  s: "squash",
  squash: "squash",
  f: "fixup",
  fixup: "fixup",
  d: "drop",
  drop: "drop",
  b: "break",
  break: "break",
  x: "exec",
  exec: "exec",
  l: "label",
  label: "label",
  t: "reset",
  reset: "reset",
  m: "merge",
  merge: "merge",
  "update-ref": "update-ref",
};

export interface RebaseTodoEntry {
  /** Normalized action name. */
  action: RebaseTodoAction;
  /** Commit SHA when present (pick/reword/edit/squash/fixup/drop). */
  sha?: string;
  /** Rest of the line after action (+ sha). */
  rest: string;
  /** True for comment / blank lines preserved for round-trip. */
  isComment: boolean;
  /** Original line text (without trailing newline). */
  raw: string;
}

/**
 * Parse a full `git-rebase-todo` file body.
 * Comments (`#…`) and blank lines are kept as `isComment` entries.
 */
export function parseRebaseTodo(text: string): RebaseTodoEntry[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  // Drop single trailing empty from final newline
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const entries: RebaseTodoEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      entries.push({
        action: "pick",
        rest: "",
        isComment: true,
        raw: line,
      });
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const verb = (parts[0] ?? "").toLowerCase();
    const action = ACTION_ALIASES[verb];
    if (!action) {
      // Unknown — keep as comment-like raw so we do not drop data
      entries.push({
        action: "pick",
        rest: trimmed,
        isComment: true,
        raw: line,
      });
      continue;
    }

    if (action === "break") {
      entries.push({ action, rest: "", isComment: false, raw: line });
      continue;
    }

    if (action === "exec" || action === "label" || action === "reset" || action === "merge") {
      const rest = trimmed.slice(parts[0]!.length).trim();
      entries.push({ action, rest, isComment: false, raw: line });
      continue;
    }

    // pick/reword/edit/squash/fixup/drop: action sha [subject…]
    const sha = parts[1];
    const rest = parts.slice(2).join(" ");
    entries.push({
      action,
      sha: sha && /^[0-9a-f]{4,64}$/i.test(sha) ? sha : undefined,
      rest: sha && !/^[0-9a-f]{4,64}$/i.test(sha) ? parts.slice(1).join(" ") : rest,
      isComment: false,
      raw: line,
    });
  }
  return entries;
}

/**
 * Serialize entries back to a `git-rebase-todo` body (trailing newline).
 * Comment entries use `raw`; commands are rebuilt from fields.
 */
export function serializeRebaseTodo(entries: RebaseTodoEntry[]): string {
  const lines = entries.map((e) => {
    if (e.isComment) return e.raw;
    if (e.action === "break") return "break";
    if (
      e.action === "exec" ||
      e.action === "label" ||
      e.action === "reset" ||
      e.action === "merge"
    ) {
      return e.rest ? `${e.action} ${e.rest}` : e.action;
    }
    if (e.action === "drop" && e.sha) {
      // Explicit drop line (git also accepts omitting the line)
      return e.rest ? `drop ${e.sha} ${e.rest}` : `drop ${e.sha}`;
    }
    if (e.sha) {
      return e.rest ? `${e.action} ${e.sha} ${e.rest}` : `${e.action} ${e.sha}`;
    }
    return e.raw || e.action;
  });
  return lines.join("\n") + (lines.length ? "\n" : "");
}

/** Mutable command entries only (for UI reorder). */
export function actionableEntries(entries: RebaseTodoEntry[]): RebaseTodoEntry[] {
  return entries.filter((e) => !e.isComment && e.action !== "break");
}

/**
 * Apply a list of action changes by index among actionable entries.
 * Used by scripted sequence editors in tests.
 */
export function applyTodoActions(
  entries: RebaseTodoEntry[],
  changes: ReadonlyArray<{ index: number; action: RebaseTodoAction }>,
): RebaseTodoEntry[] {
  const next = entries.map((e) => ({ ...e }));
  let actionIdx = -1;
  for (let i = 0; i < next.length; i++) {
    const e = next[i]!;
    if (e.isComment || e.action === "break") continue;
    actionIdx += 1;
    const change = changes.find((c) => c.index === actionIdx);
    if (change) {
      next[i] = { ...e, action: change.action };
    }
  }
  return next;
}
