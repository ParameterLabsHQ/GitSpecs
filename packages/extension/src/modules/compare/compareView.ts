import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { createGitSpecsWebview } from "../../shell/webviewHost.js";
import {
  isCompareClientMessage,
  type CompareDataDto,
} from "../../webviews/compare/protocol.js";
import { openRevisionDiff } from "../revision/commands.js";

export async function openDualPaneCompare(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
  options?: { base?: string; head?: string; againstWorkingTree?: boolean },
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }

  let base = options?.base;
  let head = options?.head;
  let againstWorkingTree = options?.againstWorkingTree ?? false;

  if (!base) {
    base = await vscode.window.showInputBox({
      title: "Compare base ref",
      placeHolder: "main",
      value: "main",
      ignoreFocusOut: true,
    });
    if (!base?.trim()) return;
    base = base.trim();
  }
  if (!againstWorkingTree && !head) {
    const mode = await vscode.window.showQuickPick(
      [
        { label: "Working Tree", againstWorkingTree: true },
        { label: "Another ref…", againstWorkingTree: false },
      ],
      { title: "Compare against" },
    );
    if (!mode) return;
    againstWorkingTree = mode.againstWorkingTree;
    if (!againstWorkingTree) {
      head = await vscode.window.showInputBox({
        title: "Head ref",
        placeHolder: "HEAD",
        value: "HEAD",
        ignoreFocusOut: true,
      });
      if (!head?.trim()) return;
      head = head.trim();
    }
  }

  const result = await repo.branches.compare({
    base,
    head: againstWorkingTree ? undefined : head,
    againstWorkingTree,
  });

  const payload: CompareDataDto = {
    base: result.base,
    head: result.head,
    ahead: result.ahead,
    behind: result.behind,
    shortstat: result.shortstat,
    againstWorkingTree: result.againstWorkingTree,
    files: result.files.map((f) => ({
      status: f.status,
      path: f.path,
      oldPath: f.oldPath,
    })),
    repoRoot: repo.root,
  };

  const wv = createGitSpecsWebview({
    viewType: "gitspecs.compareView",
    title: "GitSpecs Compare",
    scriptName: "compare",
    extensionUri: context.extensionUri,
  });

  wv.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
    if (!isCompareClientMessage(raw)) return;
    if (raw.type === "cmp:ready") {
      await wv.postMessage({ type: "cmp:data", payload });
      return;
    }
    if (raw.type === "cmp:openFile") {
      try {
        const filePath = raw.payload.path;
        if (againstWorkingTree) {
          await openRevisionDiff(repo.root, filePath, base!, "working");
        } else {
          await openRevisionDiff(repo.root, filePath, base!, head ?? "HEAD");
        }
      } catch (err) {
        log.info(
          `Compare open file failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}
