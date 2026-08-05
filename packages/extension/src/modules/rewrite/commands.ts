import * as vscode from "vscode";
import {
  formatConflictGuidance,
  type RewriteStatus,
} from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";

export function registerRewriteCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  refresh: RefreshBus,
  log: PlatformLog,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => refresh.fire(),
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.rewrite.status",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const st = await repo.rewrite.status();
        await showRewriteStatus(st);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.rewrite.rebase",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const branches = await repo.branches.list({ includeRemotes: true });
        const pick = await vscode.window.showQuickPick(
          branches.map((b) => ({
            label: b.name,
            description: b.remote ? "remote" : b.current ? "current" : "local",
            name: b.name,
          })),
          {
            title: "GitSpecs: Rebase onto…",
            placeHolder: "Select base branch/ref",
          },
        );
        if (!pick) return;
        const ok = await vscode.window.showWarningMessage(
          `Rebase the current branch onto “${pick.name}”? Worktree must be clean.`,
          { modal: true },
          "Rebase",
        );
        if (ok !== "Rebase") return;
        try {
          await repo.rewrite.guidedRebase({ onto: pick.name });
          void vscode.window.showInformationMessage(
            `Rebased onto ${pick.name}`,
          );
        } catch (err) {
          // Present conflict guidance here; do not rethrow (avoids double error UI).
          await presentRewriteFailure(repos, log, err);
        }
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.rewrite.cherryPick",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const commits = await repo.history.recent({ limit: 50 });
        const pick = await vscode.window.showQuickPick(
          commits.map((c) => ({
            label: c.sha.slice(0, 7),
            description: c.subject,
            detail: c.author,
            sha: c.sha,
          })),
          {
            title: "GitSpecs: Cherry-pick…",
            canPickMany: true,
            matchOnDescription: true,
          },
        );
        if (!pick?.length) return;
        const ok = await vscode.window.showWarningMessage(
          `Cherry-pick ${pick.length} commit(s)? Worktree must be clean.`,
          { modal: true },
          "Cherry-pick",
        );
        if (ok !== "Cherry-pick") return;
        try {
          await repo.rewrite.guidedCherryPick({
            commits: pick.map((p) => p.sha),
          });
          void vscode.window.showInformationMessage(
            `Cherry-picked ${pick.length} commit(s)`,
          );
        } catch (err) {
          await presentRewriteFailure(repos, log, err);
        }
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.rewrite.abort",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const st = await repo.rewrite.status();
        if (st.kind === "none") {
          void vscode.window.showInformationMessage(st.label);
          return;
        }
        const ok = await vscode.window.showWarningMessage(
          `Abort ${st.kind}? This undoes the in-progress rewrite.`,
          { modal: true },
          "Abort",
        );
        if (ok !== "Abort") return;
        await repo.rewrite.abort();
        void vscode.window.showInformationMessage("Rewrite aborted");
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.rewrite.continue",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const st = await repo.rewrite.status();
        if (st.kind === "none") {
          void vscode.window.showInformationMessage(st.label);
          return;
        }
        if (st.conflictedPaths.length > 0) {
          void vscode.window.showErrorMessage(
            formatConflictGuidance(st.kind, st.conflictedPaths),
          );
          return;
        }
        await repo.rewrite.continueOp();
        void vscode.window.showInformationMessage("Rewrite continued");
      }),
    ),
  );
}

async function showRewriteStatus(st: RewriteStatus): Promise<void> {
  const msg = formatConflictGuidance(st.kind, st.conflictedPaths);
  if (st.kind === "none") {
    void vscode.window.showInformationMessage(msg);
    return;
  }
  void vscode.window.showWarningMessage(msg, { modal: false });
}

/**
 * After a failed guided rewrite, surface status + conflict guidance.
 * Caller still rethrows so bindCommand/presentError can log.
 */
async function presentRewriteFailure(
  repos: RepoContext,
  log: PlatformLog,
  err: unknown,
): Promise<void> {
  const repo = repos.currentRepo;
  const detail = err instanceof Error ? err.message : String(err);
  log.error(detail);
  if (!repo) {
    await presentError(log, err, "Rewrite");
    return;
  }
  try {
    const st = await repo.rewrite.status();
    if (st.kind !== "none") {
      const guidance = formatConflictGuidance(st.kind, st.conflictedPaths);
      log.error(guidance);
      const action = await vscode.window.showErrorMessage(
        `${detail}\n\n${guidance}`,
        "Abort",
        "Show Output",
      );
      if (action === "Abort") {
        await repo.rewrite.abort();
        void vscode.window.showInformationMessage("Rewrite aborted");
      } else if (action === "Show Output") {
        log.show();
      }
      return;
    }
  } catch {
    // fall through to generic presenter
  }
  await presentError(log, err, "Rewrite");
}
