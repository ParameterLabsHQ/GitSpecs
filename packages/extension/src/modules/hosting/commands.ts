import * as vscode from "vscode";
import { parseRemoteUrl } from "@gitspecs/host-urls";
import { GitHubClient, GitLabClient, type IssueSummary } from "@gitspecs/host-api";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import type { RefreshBus } from "../../shell/refreshBus.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import {
  getAzurePat,
  getBitbucketPat,
  getGitHubToken,
  getGitLabPat,
  githubApiBaseUrl,
  gitlabApiBaseUrl,
  hostingEnabled,
  setAzurePat,
  setBitbucketPat,
  setGitLabPat,
  signInGitHub,
  signOutAllPats,
  signOutGitHub,
} from "./auth.js";
import { branchPrBadges } from "./prCache.js";
import { enrichAutolinkMarkdown } from "./enrich.js";
import { findAutolinks } from "../autolinks/format.js";
import { readAutolinkRules } from "../autolinks/settings.js";

/** Shared issue title cache for hover enrichment (repo-scoped numbers). */
const issueMetaCache = new Map<string, IssueSummary>();

export function registerHostingCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
  refresh?: RefreshBus,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  const storePat = async (
    title: string,
    setter: (s: vscode.SecretStorage, v: string | undefined) => Promise<void>,
  ) => {
    const pat = await vscode.window.showInputBox({
      title,
      password: true,
      ignoreFocusOut: true,
      prompt: "Stored in VS Code SecretStorage (never in settings). Leave empty to clear.",
    });
    if (pat === undefined) return;
    await setter(context.secrets, pat.trim() || undefined);
    void vscode.window.showInformationMessage(
      pat.trim() ? `GitSpecs: ${title} saved` : `GitSpecs: ${title} cleared`,
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.hosting.signInGitHub",
      run(async () => {
        const token = await signInGitHub();
        void vscode.window.showInformationMessage(
          token ? "GitSpecs: signed in to GitHub" : "GitSpecs: GitHub sign-in cancelled",
        );
        await refreshBranchPrBadges(repos, log);
        refresh?.fire();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.signOutGitHub",
      run(async () => {
        await signOutGitHub();
        branchPrBadges.clear();
        issueMetaCache.clear();
        void vscode.window.showInformationMessage("GitSpecs: signed out of GitHub session");
        refresh?.fire();
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.setGitLabPat",
      run(async () => {
        await storePat("GitLab personal access token", setGitLabPat);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.setBitbucketPat",
      run(async () => {
        await storePat("Bitbucket app password / PAT", setBitbucketPat);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.setAzurePat",
      run(async () => {
        await storePat("Azure DevOps PAT", setAzurePat);
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.signOutPats",
      run(async () => {
        await signOutAllPats(context.secrets);
        void vscode.window.showInformationMessage("GitSpecs: hosting PATs cleared");
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
        const base = await client.getDefaultBranch(identity.owner, identity.repo);
        try {
          const prs = await client.listPullRequestsForBranch(
            identity.owner,
            identity.repo,
            current.name,
          );
          branchPrBadges.set(repo.root, current.name, prs[0]);
          if (prs.length === 0) {
            await offerCreatePr(client, identity.owner, identity.repo, base, current.name, token);
            return;
          }
          const pick = await vscode.window.showQuickPick(
            prs.map((p) => ({
              label: `#${p.number} ${p.title}`,
              description: p.authorLogin,
              detail: p.ciStatus ? `CI: ${p.ciStatus}` : undefined,
              url: p.url,
            })),
            { title: `PRs for ${current.name}` },
          );
          if (pick?.url) await vscode.env.openExternal(vscode.Uri.parse(pick.url));
        } catch (err) {
          log.info(`PR-for-branch: ${err instanceof Error ? err.message : String(err)}`);
          const url = GitHubClient.createPullRequestUrl(
            identity.owner,
            identity.repo,
            base,
            current.name,
          );
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        refresh?.fire();
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

        if (identity.provider === "github") {
          const token = await getGitHubToken();
          const client = new GitHubClient({ token, baseUrl: githubApiBaseUrl() });
          const base = await client.getDefaultBranch(identity.owner, identity.repo);
          if (token) {
            const title = await vscode.window.showInputBox({
              title: "Pull request title",
              value: current,
              ignoreFocusOut: true,
            });
            if (!title?.trim()) return;
            try {
              const pr = await client.createPullRequest({
                owner: identity.owner,
                repo: identity.repo,
                title: title.trim(),
                head: current,
                base,
              });
              branchPrBadges.set(repo.root, current, pr);
              void vscode.window.showInformationMessage(`Created PR #${pr.number}`);
              await vscode.env.openExternal(vscode.Uri.parse(pr.url));
              refresh?.fire();
              return;
            } catch (err) {
              log.info(
                `API create PR failed, falling back to URL: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
          const url = GitHubClient.createPullRequestUrl(
            identity.owner,
            identity.repo,
            base,
            current,
          );
          await vscode.env.openExternal(vscode.Uri.parse(url));
          return;
        }

        if (identity.provider === "gitlab") {
          const url = GitLabClient.createMergeRequestUrl(
            `${identity.owner}/${identity.repo}`,
            current,
            "main",
          );
          await vscode.env.openExternal(vscode.Uri.parse(url));
          return;
        }

        void vscode.window.showInformationMessage("Create PR URL supports GitHub/GitLab");
      }),
    ),
    vscode.commands.registerCommand(
      "gitspecs.hosting.enrichAutolinks",
      run(async (text?: string) => {
        // Internal helper command / testable path for enrichment
        if (typeof text !== "string") return;
        const enriched = await enrichTextWithIssues(repos, text, log);
        log.info(`enriched autolinks (${enriched.length} chars)`);
      }),
    ),
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "gitspecs.hosting.prForBranch";
  status.text = "$(git-pull-request) PR";
  status.tooltip = "GitSpecs: PR for current branch";
  status.show();
  context.subscriptions.push(status);

  void refreshPrStatus(repos, status, log);
  void refreshBranchPrBadges(repos, log);
  context.subscriptions.push(
    repos.onDidChange(() => {
      void refreshPrStatus(repos, status, log);
      void refreshBranchPrBadges(repos, log);
    }),
  );
  if (refresh) {
    context.subscriptions.push(
      refresh.onDidRefresh(() => {
        void refreshPrStatus(repos, status, log);
        void refreshBranchPrBadges(repos, log);
      }),
    );
  }
}

async function offerCreatePr(
  client: GitHubClient,
  owner: string,
  repo: string,
  base: string,
  head: string,
  token: string | undefined,
): Promise<void> {
  const open = await vscode.window.showInformationMessage(
    `No open PR for ${head}. Create one?`,
    token ? "Create via API" : "Open create-PR page",
    "Cancel",
  );
  if (open === "Cancel" || !open) return;
  if (open === "Create via API" && token) {
    const title = await vscode.window.showInputBox({
      title: "Pull request title",
      value: head,
      ignoreFocusOut: true,
    });
    if (!title?.trim()) return;
    const pr = await client.createPullRequest({
      owner,
      repo,
      title: title.trim(),
      head,
      base,
    });
    await vscode.env.openExternal(vscode.Uri.parse(pr.url));
    return;
  }
  const url = GitHubClient.createPullRequestUrl(owner, repo, base, head);
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

export async function refreshBranchPrBadges(
  repos: RepoContext,
  log: PlatformLog,
): Promise<void> {
  if (!hostingEnabled()) {
    branchPrBadges.clear();
    return;
  }
  const token = await getGitHubToken();
  if (!token) return;
  for (const repo of repos.allRepos) {
    try {
      const remoteUrl = await repo.branches.getRemoteUrl("origin").catch(() => undefined);
      const identity = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
      if (!identity || identity.provider !== "github") continue;
      const client = new GitHubClient({ token, baseUrl: githubApiBaseUrl() });
      const branches = await repo.branches.list({ includeRemotes: false });
      for (const b of branches) {
        if (b.remote || b.detached) continue;
        try {
          const prs = await client.listPullRequestsForBranch(
            identity.owner,
            identity.repo,
            b.name,
          );
          branchPrBadges.set(repo.root, b.name, prs[0]);
        } catch {
          // keep last-known badge
        }
      }
    } catch (err) {
      log.debug(
        `PR badges: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function refreshPrStatus(
  repos: RepoContext,
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
      status.tooltip = "Sign in to GitHub for PR details";
      return;
    }
    const client = new GitHubClient({ token, baseUrl: githubApiBaseUrl() });
    const prs = await client.listPullRequestsForBranch(
      identity.owner,
      identity.repo,
      current.name,
    );
    branchPrBadges.set(repo.root, current.name, prs[0]);
    if (prs[0]) {
      let ci = "";
      if (prs[0].headRef) {
        try {
          const st = await client.getCiStatus(
            identity.owner,
            identity.repo,
            prs[0].headRef,
          );
          prs[0].ciStatus = st;
          ci = ` · CI ${st}`;
        } catch {
          // ignore
        }
      }
      status.text = `$(git-pull-request) #${prs[0].number}`;
      status.tooltip = `${prs[0].title}${ci}`;
    } else {
      status.text = "$(git-pull-request) PR";
      status.tooltip = `No open PR for ${current.name}`;
    }
  } catch (err) {
    log.debug(`PR status: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Enrich text with issue titles via GitHub getIssue (used by blame hovers).
 * Network-best-effort; returns original text when signed out / offline.
 */
export async function enrichTextWithIssues(
  repos: RepoContext,
  text: string,
  log: PlatformLog,
): Promise<string> {
  const rules = readAutolinkRules();
  const matches = findAutolinks(text, rules);
  if (matches.length === 0) return text;

  const repo = repos.currentRepo;
  if (!repo || !hostingEnabled()) return text;
  const remoteUrl = await repo.branches.getRemoteUrl("origin").catch(() => undefined);
  const identity = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
  if (!identity || identity.provider !== "github") return text;

  const token = await getGitHubToken();
  const client = new GitHubClient({ token, baseUrl: githubApiBaseUrl() });
  const meta = new Map<string, { number: number; title: string; url: string; state?: string }>();

  for (const m of matches) {
    const n = Number(m.num);
    if (!Number.isFinite(n)) continue;
    const cacheKey = `${identity.owner}/${identity.repo}#${n}`;
    let issue = issueMetaCache.get(cacheKey);
    if (!issue) {
      try {
        issue = await client.getIssue(identity.owner, identity.repo, n);
        if (issue) issueMetaCache.set(cacheKey, issue);
      } catch (err) {
        log.debug(`issue enrich: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (issue) {
      meta.set(m.num, {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state,
      });
    }
  }
  return enrichAutolinkMarkdown(text, matches, meta);
}

// Silence unused import warnings for PAT getters used by hub later via re-export
export { getGitLabPat, getBitbucketPat, getAzurePat, gitlabApiBaseUrl };
