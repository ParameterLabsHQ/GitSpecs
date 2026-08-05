import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { createGitSpecsWebview, type GitSpecsWebview } from "../../shell/webviewHost.js";
import {
  isGraphClientMessage,
  toGraphRowDto,
  type GraphClientMessage,
  type GraphPageDto,
} from "../../webviews/graph/protocol.js";
import { DEFAULT_GRAPH_LIMIT } from "./format.js";
import { resolveCommitUrl } from "../history/actions.js";
import { runCompareInteractive } from "../compare/commands.js";

let active: GitSpecsWebview | undefined;

/**
 * Open (or reveal) the Commit Graph webview canvas (P18).
 */
export async function openGraphView(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): Promise<void> {
  if (active) {
    active.panel.reveal(vscode.ViewColumn.Active);
    await sendPage(repos, log, active, 0, DEFAULT_GRAPH_LIMIT, false);
    return;
  }

  const wv = createGitSpecsWebview({
    viewType: "gitspecs.graphView",
    title: "GitSpecs Commit Graph",
    scriptName: "graph",
    extensionUri: context.extensionUri,
    retainContextWhenHidden: true,
  });
  active = wv;

  wv.panel.onDidDispose(() => {
    if (active === wv) active = undefined;
  });

  wv.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
    if (!isGraphClientMessage(raw)) return;
    await handleClientMessage(context, repos, log, wv, raw);
  });

  await sendPage(repos, log, wv, 0, DEFAULT_GRAPH_LIMIT, false);
}

async function handleClientMessage(
  _context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
  wv: GitSpecsWebview,
  msg: GraphClientMessage,
): Promise<void> {
  switch (msg.type) {
    case "graph:ready":
    case "graph:requestPage": {
      const skip = msg.type === "graph:requestPage" ? msg.payload.skip : 0;
      const limit =
        msg.type === "graph:requestPage" ? msg.payload.limit : DEFAULT_GRAPH_LIMIT;
      const append = msg.type === "graph:requestPage" && skip > 0;
      await sendPage(repos, log, wv, skip, limit, append);
      break;
    }
    case "graph:action":
      await runGraphAction(repos, log, msg.payload.action, msg.payload.sha);
      break;
    case "graph:select":
      log.debug(`Graph select ${msg.payload.sha.slice(0, 7)}`);
      break;
    default:
      break;
  }
}

async function sendPage(
  repos: RepoContext,
  log: PlatformLog,
  wv: GitSpecsWebview,
  skip: number,
  limit: number,
  append: boolean,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    await wv.postMessage({
      type: "graph:error",
      payload: { message: "No Git repository selected" },
    });
    return;
  }
  try {
    const page = await repo.graph.logPage({ limit, skip, all: true });
    let wip: GraphPageDto["wip"];
    try {
      // Lightweight dirty check via status porcelain
      const st = await repo.exec(["status", "--porcelain"], { allowFailure: true });
      const dirty = Boolean(st.stdout.trim());
      wip = dirty
        ? { dirty: true, summary: "Uncommitted changes in working tree" }
        : { dirty: false };
    } catch {
      wip = { dirty: false };
    }

    const payload: GraphPageDto = {
      commits: page.commits.map(toGraphRowDto),
      skip: page.skip,
      limit: page.limit,
      hasMore: page.hasMore,
      wip,
      repoRoot: repo.root,
    };
    await wv.postMessage({
      type: append ? "graph:append" : "graph:page",
      payload,
    });
    log.info(
      `Graph view page skip=${skip} count=${page.commits.length} hasMore=${page.hasMore}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await wv.postMessage({ type: "graph:error", payload: { message } });
  }
}

async function runGraphAction(
  repos: RepoContext,
  log: PlatformLog,
  action: "copySha" | "checkout" | "createBranch" | "compare" | "openRemote",
  sha: string,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  switch (action) {
    case "copySha":
      await vscode.env.clipboard.writeText(sha);
      void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
      break;
    case "checkout": {
      const ok = await vscode.window.showWarningMessage(
        `Check out ${sha.slice(0, 7)} in detached HEAD?`,
        { modal: true },
        "Checkout",
      );
      if (ok !== "Checkout") return;
      await repo.branches.checkout({ commit: sha });
      break;
    }
    case "createBranch": {
      const name = await vscode.window.showInputBox({
        title: "New branch name",
        prompt: `Create branch from ${sha.slice(0, 7)}`,
        ignoreFocusOut: true,
      });
      if (!name?.trim()) return;
      await repo.branches.createFromCommit({ name: name.trim(), commit: sha });
      break;
    }
    case "compare":
      await runCompareInteractive(repos, log, sha);
      break;
    case "openRemote": {
      let remoteUrl: string | undefined;
      try {
        remoteUrl = await repo.branches.getRemoteUrl("origin");
      } catch {
        remoteUrl = undefined;
      }
      const url = resolveCommitUrl(remoteUrl, sha);
      if (!url) {
        void vscode.window.showInformationMessage(
          "Could not build a commit URL for the origin remote",
        );
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
      break;
    }
  }
}
