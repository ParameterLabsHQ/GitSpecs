import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { createGitSpecsWebview } from "../../shell/webviewHost.js";
import {
  isFileHistoryClientMessage,
  type ChurnPointDto,
} from "../../webviews/fileHistory/protocol.js";
import { openRevisionDiff } from "../revision/commands.js";

export async function openVisualFileHistory(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
  filePath?: string,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) {
    void vscode.window.showInformationMessage("No Git repository selected");
    return;
  }
  let path = filePath;
  if (!path) {
    const ed = vscode.window.activeTextEditor;
    if (ed?.document.uri.scheme === "file") path = ed.document.uri.fsPath;
  }
  if (!path) {
    void vscode.window.showInformationMessage("Open a file to show Visual File History");
    return;
  }

  const rows = await repo.history.fileChurn(path, { limit: 100 });
  const points: ChurnPointDto[] = rows.map((r) => ({
    sha: r.sha,
    shortSha: r.sha.slice(0, 7),
    subject: r.subject,
    author: r.author,
    authorTime: r.authorTime,
    additions: r.additions,
    deletions: r.deletions,
  }));

  const wv = createGitSpecsWebview({
    viewType: "gitspecs.visualFileHistory",
    title: "GitSpecs Visual File History",
    scriptName: "fileHistory",
    extensionUri: context.extensionUri,
  });

  wv.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
    if (!isFileHistoryClientMessage(raw)) return;
    if (raw.type === "fh:ready") {
      await wv.postMessage({
        type: "fh:data",
        payload: { path, points },
      });
      return;
    }
    if (raw.type === "fh:open") {
      try {
        await openRevisionDiff(repo.root, path!, raw.payload.sha, "working");
      } catch (err) {
        log.info(
          `Visual history open failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}
