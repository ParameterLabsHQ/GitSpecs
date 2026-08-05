import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { bindCommand } from "../../shell/bindCommand.js";
import type { RemoteItem } from "./provider.js";
import { resolveRemoteWebUrl } from "./format.js";

export function registerRemoteCommands(
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

  const runQuiet = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand("gitspecs.remotes.refresh", run(async () => {})),

    vscode.commands.registerCommand(
      "gitspecs.remotes.fetch",
      run(async (item?: RemoteItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const name = item?.remote.name;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: name ? `Fetching ${name}…` : "Fetching…",
          },
          async () => repo.remotes.fetch({ remote: name }),
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.remotes.copyUrl",
      runQuiet(async (item?: RemoteItem) => {
        const url = item?.remote.fetchUrl ?? item?.remote.pushUrl;
        if (!url) {
          void vscode.window.showInformationMessage("No remote URL");
          return;
        }
        await vscode.env.clipboard.writeText(url);
        void vscode.window.setStatusBarMessage("GitSpecs: remote URL copied", 2000);
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.remotes.open",
      runQuiet(async (item?: RemoteItem) => {
        const raw = item?.remote.fetchUrl ?? item?.remote.pushUrl;
        const web = resolveRemoteWebUrl(raw);
        if (!web) {
          void vscode.window.showInformationMessage(
            "Could not build a web URL for this remote (URL-only hosts)",
          );
          return;
        }
        await vscode.env.openExternal(vscode.Uri.parse(web));
      }),
    ),
  );
}
