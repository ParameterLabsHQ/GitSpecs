import * as vscode from "vscode";
import { parseRemoteUrl, branchUrl } from "@gitplatform/host-urls";
import type { RepoContext } from "../../shell/repoContext.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import type { BranchItem } from "./provider.js";

function confirmDeletes(): boolean {
  return vscode.workspace.getConfiguration("gitPlatform").get<boolean>("confirmDelete", true);
}

export function registerBranchCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  refresh: RefreshBus,
  log: PlatformLog,
): void {
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
      refresh.fire();
    } catch (err) {
      await presentError(log, err);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitPlatform.branches.refresh",
      run(async () => {}),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.create",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const name = await vscode.window.showInputBox({ title: "New branch name" });
        if (!name) return;
        const start = await vscode.window.showInputBox({
          title: "Start point (optional)",
          placeHolder: "HEAD",
        });
        await repo.branches.create({
          name,
          startPoint: start?.trim() || undefined,
        });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.rename",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const oldName = item?.info.name ?? (await pickLocalBranch(repos));
        if (!oldName) return;
        const newName = await vscode.window.showInputBox({
          title: "Rename branch",
          value: oldName,
        });
        if (!newName || newName === oldName) return;
        await repo.branches.rename({ oldName, newName });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.delete",
      run(async (item?: BranchItem) => {
        await deleteBranch(repos, item, false);
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.deleteForce",
      run(async (item?: BranchItem) => {
        await deleteBranch(repos, item, true);
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.checkout",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const name = item?.info.name ?? (await pickAnyBranch(repos));
        if (!name) return;
        if (item?.info.remote) {
          // checkout remote as local tracking if needed
          const short = name.includes("/") ? name.split("/").slice(1).join("/") : name;
          try {
            await repo.branches.switchTo(short);
          } catch {
            await repo.branches.checkout({ name: short, create: true, commit: name });
          }
        } else {
          await repo.branches.switchTo(name);
        }
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.publish",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const name = item?.info.name ?? (await pickLocalBranch(repos));
        if (!name) return;
        const remotes = await repo.branches.listRemotes();
        const remote =
          remotes.length === 1
            ? remotes[0]
            : (
                await vscode.window.showQuickPick(remotes, { title: "Remote" })
              ) ?? undefined;
        if (!remote && remotes.length === 0) {
          void vscode.window.showErrorMessage("No remotes configured");
          return;
        }
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Publishing…" },
          async () => repo.branches.publish({ branch: name, remote: remote ?? "origin" }),
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.push",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Pushing…" },
          async () => repo.branches.push(),
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.pull",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Pulling…" },
          async () => repo.branches.pull(),
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.fetch",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Fetching…" },
          async () => repo.branches.fetch(),
        );
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.setUpstream",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const branch = item?.info.name ?? (await pickLocalBranch(repos));
        if (!branch) return;
        const remotes = await repo.branches.listRemotes();
        const remote = await vscode.window.showQuickPick(remotes, { title: "Remote" });
        if (!remote) return;
        const remoteBranch =
          (await vscode.window.showInputBox({
            title: "Remote branch name",
            value: branch,
          })) ?? branch;
        await repo.branches.setUpstream({ branch, remote, remoteBranch });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.deleteRemote",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        let remote: string;
        let name: string;
        if (item?.info.remote) {
          const parts = item.info.name.split("/");
          remote = parts[0]!;
          name = parts.slice(1).join("/");
        } else {
          const remotes = await repo.branches.listRemotes();
          remote = (await vscode.window.showQuickPick(remotes, { title: "Remote" })) ?? "";
          if (!remote) return;
          name =
            (await vscode.window.showInputBox({ title: "Remote branch to delete" })) ?? "";
          if (!name) return;
        }
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Delete ${remote}/${name} on the remote?`,
            { modal: true },
            "Delete",
          );
          if (ok !== "Delete") return;
        }
        await repo.branches.deleteRemote({ remote, name });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.merge",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const ref = item?.info.name ?? (await pickAnyBranch(repos));
        if (!ref) return;
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Merge ${ref} into the current branch?`,
            { modal: true },
            "Merge",
          );
          if (ok !== "Merge") return;
        }
        await repo.branches.merge({ ref });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.rebase",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const onto = item?.info.name ?? (await pickAnyBranch(repos));
        if (!onto) return;
        if (confirmDeletes()) {
          const ok = await vscode.window.showWarningMessage(
            `Rebase current branch onto ${onto}?`,
            { modal: true },
            "Rebase",
          );
          if (ok !== "Rebase") return;
        }
        await repo.branches.rebase({ onto });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.cherryPick",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const commits = await repo.branches.recentCommits(50);
        const pick = await vscode.window.showQuickPick(
          commits.map((c) => ({
            label: c.sha.slice(0, 7),
            description: c.subject,
            sha: c.sha,
          })),
          { title: "Cherry-pick commit", canPickMany: true },
        );
        if (!pick || pick.length === 0) return;
        await repo.branches.cherryPick({ commits: pick.map((p) => p.sha) });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.createFromCommit",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const commits = await repo.branches.recentCommits(50);
        const pick = await vscode.window.showQuickPick(
          commits.map((c) => ({
            label: c.sha.slice(0, 7),
            description: c.subject,
            sha: c.sha,
          })),
          { title: "Commit for new branch" },
        );
        if (!pick) return;
        const name = await vscode.window.showInputBox({ title: "New branch name" });
        if (!name) return;
        await repo.branches.createFromCommit({ name, commit: pick.sha });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.compare",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const head = item?.info.name ?? (await pickAnyBranch(repos));
        if (!head) return;
        const base = await pickAnyBranch(repos, "Compare base");
        if (!base) return;
        const result = await repo.branches.compare({ base, head });
        const msg = `Compare ${base}...${head}: ahead ${result.ahead}, behind ${result.behind}${result.shortstat ? ` — ${result.shortstat}` : ""}`;
        log.info(msg);
        void vscode.window.showInformationMessage(msg, "Show Output").then((a) => {
          if (a === "Show Output") log.show();
        });
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.copyName",
      run(async (item?: BranchItem) => {
        const name = item?.info.name ?? (await pickAnyBranch(repos));
        if (!name) return;
        await vscode.env.clipboard.writeText(name);
        void vscode.window.showInformationMessage("Branch name copied");
      }),
    ),

    vscode.commands.registerCommand(
      "gitPlatform.branches.openRemote",
      run(async (item?: BranchItem) => {
        const repo = repos.currentRepo;
        if (!repo) return;
        let branchName = item?.info.name;
        if (!branchName) {
          branchName = await pickAnyBranch(repos);
        }
        if (!branchName) return;
        // strip remote prefix for URL
        const branch = branchName.includes("/")
          ? branchName.split("/").slice(1).join("/")
          : branchName;
        const remoteUrl = await repo.branches.getRemoteUrl("origin");
        if (!remoteUrl) {
          void vscode.window.showInformationMessage("No origin remote URL configured.");
          return;
        }
        const id = parseRemoteUrl(remoteUrl);
        if (!id) {
          void vscode.window.showInformationMessage(
            `Can't open remote for this URL: ${remoteUrl}`,
          );
          return;
        }
        const url = branchUrl(id, branch);
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }),
    ),
  );
}

async function deleteBranch(
  repos: RepoContext,
  item: BranchItem | undefined,
  force: boolean,
): Promise<void> {
  const repo = repos.currentRepo;
  if (!repo) return;
  const name = item?.info.name ?? (await pickLocalBranch(repos));
  if (!name) return;
  if (confirmDeletes()) {
    const ok = await vscode.window.showWarningMessage(
      `${force ? "Force delete" : "Delete"} branch ${name}?`,
      { modal: true },
      "Delete",
    );
    if (ok !== "Delete") return;
  }
  await repo.branches.delete({ name, force });
}

async function pickLocalBranch(repos: RepoContext): Promise<string | undefined> {
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  const list = (await repo.branches.list({ includeRemotes: false })).filter((b) => !b.detached);
  const pick = await vscode.window.showQuickPick(
    list.map((b) => ({ label: b.name, description: b.current ? "current" : "" })),
    { title: "Select branch" },
  );
  return pick?.label;
}

async function pickAnyBranch(
  repos: RepoContext,
  title = "Select branch",
): Promise<string | undefined> {
  const repo = repos.currentRepo;
  if (!repo) return undefined;
  const list = await repo.branches.list({ includeRemotes: true });
  const pick = await vscode.window.showQuickPick(
    list.map((b) => ({ label: b.name, description: b.remote ? "remote" : "" })),
    { title },
  );
  return pick?.label;
}
