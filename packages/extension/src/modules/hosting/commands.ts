import * as vscode from "vscode";
import { parseRemoteUrl } from "@gitspecs/host-urls";
import { GitHubClient, GitLabClient } from "@gitspecs/host-api";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import {
  getGitHubToken,
  getGitLabPat,
  githubApiBaseUrl,
  gitlabApiBaseUrl,
  hostingEnabled,
  setGitLabPat,
  signInGitHub,
} from "./auth.js";

export function registerHostingCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.hosting.signInGitHub",
      run(async () => {
        const token = await signInGitHub();
        void vscode.window.showInformationMessage(
          token ? "GitSpecs: signed in to GitHub" : "GitSpecs: GitHub sign-in cancelled",
        );
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.setGitLabPat",
      run(async () => {
        const pat = await vscode.window.showInputBox({
          title: "GitLab personal access token",
          password: true,
          ignoreFocusOut: true,
          prompt: "Stored in VS Code SecretStorage (never in settings)",
        });
        if (pat === undefined) return;
        await setGitLabPat(context.secrets, pat.trim() || undefined);
        void vscode.window.showInformationMessage(
          pat.trim() ? "GitSpecs: GitLab PAT saved" : "GitSpecs: GitLab PAT cleared",
        );
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.prForBranch",
      run(async () => {
        if (!hostingEnabled()) {
          void vscode.window.showInformationMessage("Hosting integrations are disabled");
          return;
        }
        const repo = repos.currentRepo;
        if (!repo) return;
        const remoteUrl = await repo.branches.getRemoteUrl("origin").catch(() => undefined);
        const identity = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
        if (!identity || identity.provider !== "github") {
          void vscode.window.showInformationMessage(
            "PR-for-branch currently supports GitHub remotes (URL parseable)",
          );
          return;
        }
        const branches = await repo.branches.list({ includeRemotes: false });
        const current = branches.find((b) => b.current && !b.detached);
        if (!current) {
          void vscode.window.showInformationMessage("No current branch");
          return;
        }
        const token = await getGitHubToken();
        const client = new GitHubClient({
          token,
          baseUrl: githubApiBaseUrl(),
        });
        try {
          const prs = await client.listPullRequestsForBranch(
            identity.owner,
            identity.repo,
            current.name,
          );
          if (prs.length === 0) {
            const url = GitHubClient.createPullRequestUrl(
              identity.owner,
              identity.repo,
              "main",
              current.name,
            );
            const open = await vscode.window.showInformationMessage(
              `No open PR for ${current.name}. Open create-PR page?`,
              "Create PR",
            );
            if (open === "Create PR") await vscode.env.openExternal(vscode.Uri.parse(url));
            return;
          }
          const pick = await vscode.window.showQuickPick(
            prs.map((p) => ({
              label: `#${p.number} ${p.title}`,
              description: p.authorLogin,
              url: p.url,
            })),
            { title: `PRs for ${current.name}` },
          );
          if (pick?.url) await vscode.env.openExternal(vscode.Uri.parse(pick.url));
        } catch (err) {
          log.info(`PR-for-branch: ${err instanceof Error ? err.message : String(err)}`);
          // Offline / rate limit — still offer create URL
          const url = GitHubClient.createPullRequestUrl(
            identity.owner,
            identity.repo,
            "main",
            current.name,
          );
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.createPr",
      run(async () => {
        const repo = repos.currentRepo;
        if (!repo) return;
        const remoteUrl = await repo.branches.getRemoteUrl("origin").catch(() => undefined);
        const identity = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
        if (!identity) {
          void vscode.window.showInformationMessage("Could not parse origin remote");
          return;
        }
        const branches = await repo.branches.list({ includeRemotes: false });
        const current = branches.find((b) => b.current)?.name ?? "HEAD";
        let url: string;
        if (identity.provider === "github") {
          url = GitHubClient.createPullRequestUrl(
            identity.owner,
            identity.repo,
            "main",
            current,
          );
        } else if (identity.provider === "gitlab") {
          url = GitLabClient.createMergeRequestUrl(
            `${identity.owner}/${identity.repo}`,
            current,
            "main",
          );
        } else {
          void vscode.window.showInformationMessage("Create PR URL supports GitHub/GitLab");
          return;
        }
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }),
    ),
  );

  // Warm status bar for PR-for-branch (best-effort, never blocks git)
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "gitspecs.hosting.prForBranch";
  status.text = "$(git-pull-request) PR";
  status.tooltip = "GitSpecs: PR for current branch";
  status.show();
  context.subscriptions.push(status);

  void refreshPrStatus(repos, context, status, log);
  context.subscriptions.push(
    repos.onDidChange(() => void refreshPrStatus(repos, context, status, log)),
  );
}

async function refreshPrStatus(
  repos: RepoContext,
  context: vscode.ExtensionContext,
  status: vscode.StatusBarItem,
  log: PlatformLog,
): Promise<void> {
  if (!hostingEnabled()) {
    status.hide();
    return;
  }
  status.show();
  const repo = repos.currentRepo;
  if (!repo) {
    status.text = "$(git-pull-request) PR";
    return;
  }
  try {
    const remoteUrl = await repo.branches.getRemoteUrl("origin").catch(() => undefined);
    const identity = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
    if (!identity || identity.provider !== "github") {
      status.text = "$(git-pull-request) PR";
      return;
    }
    const branches = await repo.branches.list({ includeRemotes: false });
    const current = branches.find((b) => b.current && !b.detached);
    if (!current) return;
    const token = await getGitHubToken();
    if (!token) {
      status.text = "$(git-pull-request) PR";
      status.tooltip = "Sign in to GitHub for PR details (GitSpecs: Sign In to GitHub)";
      return;
    }
    const client = new GitHubClient({ token, baseUrl: githubApiBaseUrl() });
    const prs = await client.listPullRequestsForBranch(
      identity.owner,
      identity.repo,
      current.name,
    );
    if (prs[0]) {
      status.text = `$(git-pull-request) #${prs[0].number}`;
      status.tooltip = prs[0].title;
    } else {
      status.text = "$(git-pull-request) PR";
      status.tooltip = `No open PR for ${current.name}`;
    }
    void context;
    void getGitLabPat;
    void gitlabApiBaseUrl;
  } catch (err) {
    log.debug(`PR status: ${err instanceof Error ? err.message : String(err)}`);
  }
}
