import { access, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { GitRepository } from "./repository.js";
import { DirtyWorktreeError } from "./errors.js";
import type { RebaseTodoAction } from "./rebaseTodo.js";

export type RewriteKind = "merge" | "rebase" | "cherry-pick" | "none";

export interface RewriteStatus {
  kind: RewriteKind;
  /** Human-readable state for UI. */
  label: string;
  /** Paths currently unmerged, when available. */
  conflictedPaths: string[];
}

export interface GuidedRebaseOptions {
  onto: string;
  /** When true (default), refuse to start if the worktree is dirty. */
  requireClean?: boolean;
}

export interface GuidedCherryPickOptions {
  commits: string[];
  requireClean?: boolean;
}

export interface InteractiveRebaseOptions {
  /** Upstream / onto ref for `git rebase -i <onto>`. */
  onto: string;
  /**
   * Optional scripted edits applied by the sequence editor before git continues.
   * Indices are among **actionable** (non-comment) todo lines, 0-based.
   * When omitted, the todo is left unchanged (still exercises the editor path).
   */
  edits?: ReadonlyArray<{ index: number; action: RebaseTodoAction }>;
  /**
   * Full replacement `git-rebase-todo` body. When set, wins over `edits`.
   * Extension UI serializes the edited sequence and passes it here.
   */
  replacementTodo?: string;
  requireClean?: boolean;
}

/**
 * Safer history-rewrite helpers: in-progress detection, abort/continue,
 * and guided rebase/cherry-pick with clean-tree preflight.
 * Does **not** implement a full sequence editor or mergetool.
 */
export class RewriteApi {
  constructor(private readonly repo: GitRepository) {}

  /**
   * Detect merge / rebase / cherry-pick in progress and list unmerged paths.
   */
  async status(): Promise<RewriteStatus> {
    const gitDir = (
      await this.repo.exec(["rev-parse", "--git-dir"])
    ).stdout.trim();
    const absGit = path.isAbsolute(gitDir)
      ? gitDir
      : path.join(this.repo.root, gitDir);

    const kind = await detectRewriteKind(absGit);
    const conflictedPaths = await listUnmergedPaths(this.repo);
    const label = labelForKind(kind, conflictedPaths.length);
    return { kind, label, conflictedPaths };
  }

  async abort(): Promise<void> {
    const st = await this.status();
    if (st.kind === "none") {
      throw new Error("No merge, rebase, or cherry-pick in progress");
    }
    if (st.kind === "merge") {
      await this.repo.exec(["merge", "--abort"]);
      return;
    }
    if (st.kind === "rebase") {
      await this.repo.exec(["rebase", "--abort"]);
      return;
    }
    await this.repo.exec(["cherry-pick", "--abort"]);
  }

  async continueOp(): Promise<void> {
    const st = await this.status();
    if (st.kind === "none") {
      throw new Error("No merge, rebase, or cherry-pick in progress");
    }
    if (st.conflictedPaths.length > 0) {
      throw new Error(
        `Cannot continue: ${st.conflictedPaths.length} conflicted path(s) remain. Resolve them first.`,
      );
    }
    if (st.kind === "merge") {
      // Completing a merge usually requires commit; try --continue is not valid for merge.
      await this.repo.exec(["commit", "--no-edit"]);
      return;
    }
    if (st.kind === "rebase") {
      await this.repo.exec(["rebase", "--continue"]);
      return;
    }
    await this.repo.exec(["cherry-pick", "--continue"]);
  }

  /**
   * Rebase current branch onto `onto` after optional clean-tree check.
   * Conflicts surface as GitConflictError from exec.
   */
  async guidedRebase(options: GuidedRebaseOptions): Promise<void> {
    const onto = options.onto.trim();
    if (!onto) throw new Error("rebase requires an onto ref");
    if (options.requireClean !== false) {
      await assertCleanWorktree(this.repo);
    }
    const inProgress = await this.status();
    if (inProgress.kind !== "none") {
      throw new Error(
        `Cannot start rebase: ${inProgress.label}. Abort or finish it first.`,
      );
    }
    await this.repo.branches.rebase({ onto });
  }

  async guidedCherryPick(options: GuidedCherryPickOptions): Promise<void> {
    if (!options.commits.length) {
      throw new Error("cherry-pick requires at least one commit");
    }
    if (options.requireClean !== false) {
      await assertCleanWorktree(this.repo);
    }
    const inProgress = await this.status();
    if (inProgress.kind !== "none") {
      throw new Error(
        `Cannot start cherry-pick: ${inProgress.label}. Abort or finish it first.`,
      );
    }
    await this.repo.branches.cherryPick({ commits: options.commits });
  }

  /**
   * Interactive rebase onto `onto` with a `GIT_SEQUENCE_EDITOR` helper.
   *
   * The helper rewrites `git-rebase-todo` using pure `parseRebaseTodo` /
   * `serializeRebaseTodo` (optional `edits` / `transformTodo`). Non-interactive
   * and unit-testable; the extension supplies `transformTodo` from the sequence
   * editor UI (P19).
   */
  async interactiveRebase(options: InteractiveRebaseOptions): Promise<void> {
    const onto = options.onto.trim();
    if (!onto) throw new Error("interactive rebase requires an onto ref");
    if (options.requireClean !== false) {
      await assertCleanWorktree(this.repo);
    }
    const inProgress = await this.status();
    if (inProgress.kind !== "none") {
      throw new Error(
        `Cannot start interactive rebase: ${inProgress.label}. Abort or finish it first.`,
      );
    }

    const workDir = path.join(tmpdir(), `gitspecs-rebase-${process.pid}-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    const planPath = path.join(workDir, "plan.json");
    const editorPath = path.join(workDir, "sequence-editor.mjs");

    const plan =
      options.replacementTodo != null
        ? { replacement: options.replacementTodo }
        : { edits: options.edits ?? [] };
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    await writeFile(editorPath, buildSequenceEditorScript(planPath), "utf8");

    const sequenceEditor = `node "${editorPath}"`;

    try {
      await this.repo.exec(["rebase", "-i", onto], {
        env: {
          ...process.env,
          GIT_SEQUENCE_EDITOR: sequenceEditor,
          GIT_EDITOR: "true",
        },
      });
    } finally {
      try {
        await unlink(editorPath);
        await unlink(planPath);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Build a node sequence-editor script that rewrites git-rebase-todo using the
 * shipped parse/serialize logic inlined for the helper process.
 */
function buildSequenceEditorScript(planPath: string): string {
  // Inline minimal parse/serialize so the helper does not need package resolution.
  return `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const todoPath = process.argv[2];
if (!todoPath) process.exit(1);
const plan = JSON.parse(readFileSync(${JSON.stringify(planPath)}, "utf8"));
let text = readFileSync(todoPath, "utf8");

if (typeof plan.replacement === "string") {
  writeFileSync(todoPath, plan.replacement, "utf8");
  process.exit(0);
}

// --- inlined parse/serialize (keep in sync with rebaseTodo.ts) ---
${inlineRebaseTodoHelpers()}

const entries = parseRebaseTodo(text);
const edits = Array.isArray(plan.edits) ? plan.edits : [];
const next = applyTodoActions(entries, edits);
writeFileSync(todoPath, serializeRebaseTodo(next), "utf8");
`;
}

function inlineRebaseTodoHelpers(): string {
  // Keep the helper self-contained: re-export by reading the built logic would
  // require dist paths. Duplicate the minimal implementation as a string.
  return `
const ACTION_ALIASES = {
  p:"pick",pick:"pick",r:"reword",reword:"reword",e:"edit",edit:"edit",
  s:"squash",squash:"squash",f:"fixup",fixup:"fixup",d:"drop",drop:"drop",
  b:"break",break:"break",x:"exec",exec:"exec",
};
function parseRebaseTodo(text) {
  const normalized = text.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");
  const lines = normalized.split("\\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      entries.push({ action: "pick", rest: "", isComment: true, raw: line });
      continue;
    }
    const parts = trimmed.split(/\\s+/);
    const action = ACTION_ALIASES[(parts[0] || "").toLowerCase()];
    if (!action) {
      entries.push({ action: "pick", rest: trimmed, isComment: true, raw: line });
      continue;
    }
    if (action === "break") {
      entries.push({ action, rest: "", isComment: false, raw: line });
      continue;
    }
    if (action === "exec") {
      entries.push({ action, rest: trimmed.slice(parts[0].length).trim(), isComment: false, raw: line });
      continue;
    }
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
function serializeRebaseTodo(entries) {
  const lines = entries.map((e) => {
    if (e.isComment) return e.raw;
    if (e.action === "break") return "break";
    if (e.action === "exec") return e.rest ? "exec " + e.rest : "exec";
    if (e.sha) return e.rest ? e.action + " " + e.sha + " " + e.rest : e.action + " " + e.sha;
    return e.raw || e.action;
  });
  return lines.join("\\n") + (lines.length ? "\\n" : "");
}
function applyTodoActions(entries, changes) {
  const next = entries.map((e) => ({ ...e }));
  let actionIdx = -1;
  for (let i = 0; i < next.length; i++) {
    const e = next[i];
    if (e.isComment || e.action === "break") continue;
    actionIdx += 1;
    const change = changes.find((c) => c.index === actionIdx);
    if (change) next[i] = { ...e, action: change.action };
  }
  return next;
}
`;
}

async function detectRewriteKind(absGitDir: string): Promise<RewriteKind> {
  if (await pathExists(path.join(absGitDir, "CHERRY_PICK_HEAD"))) {
    return "cherry-pick";
  }
  if (
    (await pathExists(path.join(absGitDir, "rebase-merge"))) ||
    (await pathExists(path.join(absGitDir, "rebase-apply")))
  ) {
    return "rebase";
  }
  if (await pathExists(path.join(absGitDir, "MERGE_HEAD"))) {
    return "merge";
  }
  return "none";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listUnmergedPaths(repo: GitRepository): Promise<string[]> {
  const result = await repo.exec(["diff", "--name-only", "--diff-filter=U"], {
    allowFailure: true,
  });
  if (result.code !== 0 && !result.stdout.trim()) return [];
  return result.stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function assertCleanWorktree(repo: GitRepository): Promise<void> {
  const result = await repo.exec(["status", "--porcelain"], { allowFailure: true });
  if (result.stdout.trim()) {
    throw new DirtyWorktreeError(
      "Working tree has uncommitted changes. Commit or stash before rewrite.",
    );
  }
}

function labelForKind(kind: RewriteKind, conflictCount: number): string {
  if (kind === "none") return "No rewrite in progress";
  const base =
    kind === "merge"
      ? "Merge in progress"
      : kind === "rebase"
        ? "Rebase in progress"
        : "Cherry-pick in progress";
  if (conflictCount > 0) {
    return `${base} (${conflictCount} conflicted path${conflictCount === 1 ? "" : "s"})`;
  }
  return base;
}

/** Pure helper for conflict messaging (extension + tests). */
export function formatConflictGuidance(
  kind: RewriteKind,
  conflictedPaths: string[],
): string {
  if (kind === "none") {
    return "No merge, rebase, or cherry-pick is in progress.";
  }
  const op =
    kind === "merge" ? "merge" : kind === "rebase" ? "rebase" : "cherry-pick";
  const head = `A ${op} is in progress.`;
  if (conflictedPaths.length === 0) {
    return `${head} Resolve any remaining steps, then continue or abort.`;
  }
  const sample = conflictedPaths.slice(0, 5).join(", ");
  const more =
    conflictedPaths.length > 5
      ? ` (+${conflictedPaths.length - 5} more)`
      : "";
  return `${head} Conflicted: ${sample}${more}. Fix files, stage them, then Continue — or Abort to undo.`;
}
