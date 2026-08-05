import type {
  CheckConclusion,
  CreatePullRequestInput,
  HostClientOptions,
  HostUser,
  IssueSummary,
  PullRequestSummary,
} from "./types.js";
import { RateLimitError } from "./types.js";
import { HostApiCache, cacheKey } from "./cache.js";

export class GitHubClient {
  private readonly fetchFn: typeof fetch;
  private readonly token?: string;
  private readonly baseUrl: string;
  readonly cache: HostApiCache;

  constructor(options: HostClientOptions & { cache?: HostApiCache } = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.cache = options.cache ?? new HostApiCache();
  }

  async getAuthenticatedUser(): Promise<HostUser | undefined> {
    const key = cacheKey(["gh", "user", this.token?.slice(0, 8)]);
    try {
      const data = await this.getJson<Record<string, unknown>>("/user");
      const user: HostUser = {
        login: String(data.login ?? ""),
        name: data.name ? String(data.name) : undefined,
        avatarUrl: data.avatar_url ? String(data.avatar_url) : undefined,
      };
      this.cache.set(key, user);
      return user;
    } catch (err) {
      if (err instanceof RateLimitError) return this.cache.getStale<HostUser>(key);
      throw err;
    }
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const key = cacheKey(["gh", "default", owner, repo]);
    try {
      const data = await this.getJson<Record<string, unknown>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      );
      const name = String(data.default_branch ?? "main");
      this.cache.set(key, name);
      return name;
    } catch (err) {
      if (err instanceof RateLimitError) {
        return this.cache.getStale<string>(key) ?? "main";
      }
      // Unauthenticated / offline: common default
      return this.cache.getStale<string>(key) ?? "main";
    }
  }

  async listPullRequestsForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<PullRequestSummary[]> {
    const key = cacheKey(["gh", "prs-branch", owner, repo, branch]);
    try {
      const q = new URLSearchParams({
        head: `${owner}:${branch}`,
        state: "open",
        per_page: "10",
      });
      const data = await this.getJson<unknown[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${q}`,
      );
      const prs = Array.isArray(data) ? data.map(mapGhPr) : [];
      this.cache.set(key, prs);
      return prs;
    } catch (err) {
      if (err instanceof RateLimitError) return this.cache.getStale<PullRequestSummary[]>(key) ?? [];
      throw err;
    }
  }

  async listOpenPullRequests(owner: string, repo: string): Promise<PullRequestSummary[]> {
    const key = cacheKey(["gh", "prs-open", owner, repo]);
    try {
      const data = await this.getJson<unknown[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=30`,
      );
      const prs = Array.isArray(data) ? data.map(mapGhPr) : [];
      this.cache.set(key, prs);
      return prs;
    } catch (err) {
      if (err instanceof RateLimitError) return this.cache.getStale<PullRequestSummary[]>(key) ?? [];
      throw err;
    }
  }

  /** PRs authored by the authenticated user in a repo. */
  async listMyOpenPullRequests(
    owner: string,
    repo: string,
    login: string,
  ): Promise<PullRequestSummary[]> {
    const all = await this.listOpenPullRequests(owner, repo);
    return all.filter(
      (p) => (p.authorLogin ?? "").toLowerCase() === login.toLowerCase(),
    );
  }

  /**
   * Open PRs where review is requested from the authenticated user
   * (`search/issues` review-requested filter).
   *
   * Search hits lack `head.ref`; each result is enriched via `getPullRequest`
   * so checkout/worktree actions have a real branch name.
   */
  async listReviewRequested(login: string): Promise<PullRequestSummary[]> {
    const key = cacheKey(["gh", "review-req", login]);
    try {
      const q = encodeURIComponent(`is:pr is:open review-requested:${login}`);
      const data = await this.getJson<{ items?: unknown[] }>(
        `/search/issues?q=${q}&per_page=30`,
      );
      const items = Array.isArray(data.items) ? data.items : [];
      const prs: PullRequestSummary[] = [];
      for (const raw of items) {
        const partial = mapGhSearchIssueToPr(raw);
        const loc = parseRepoFromSearchItem(raw);
        if (loc && partial.number > 0) {
          try {
            const full = await this.getPullRequest(loc.owner, loc.repo, partial.number);
            prs.push(full);
            continue;
          } catch {
            // fall through to partial
          }
        }
        prs.push(partial);
      }
      this.cache.set(key, prs);
      return prs;
    } catch (err) {
      if (err instanceof RateLimitError) return this.cache.getStale<PullRequestSummary[]>(key) ?? [];
      throw err;
    }
  }

  /** Full PR payload (includes head.ref) for a number. */
  async getPullRequest(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PullRequestSummary> {
    const key = cacheKey(["gh", "pr", owner, repo, number]);
    try {
      const data = await this.getJson<Record<string, unknown>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
      );
      const pr = mapGhPr(data);
      this.cache.set(key, pr);
      return pr;
    } catch (err) {
      if (err instanceof RateLimitError) {
        const stale = this.cache.getStale<PullRequestSummary>(key);
        if (stale) return stale;
      }
      throw err;
    }
  }

  /** Issues assigned to the authenticated user. */
  async listAssignedIssues(login?: string): Promise<IssueSummary[]> {
    const key = cacheKey(["gh", "assigned", login ?? "me"]);
    try {
      const q = new URLSearchParams({
        filter: "assigned",
        state: "open",
        per_page: "30",
      });
      const data = await this.getJson<unknown[]>(`/issues?${q}`);
      const issues = (Array.isArray(data) ? data : [])
        // /issues includes PRs; drop pull_request payloads
        .filter((raw) => {
          const r = raw as Record<string, unknown>;
          return !r.pull_request;
        })
        .map((raw) => mapGhIssue(raw as Record<string, unknown>));
      this.cache.set(key, issues);
      return issues;
    } catch (err) {
      if (err instanceof RateLimitError) return this.cache.getStale<IssueSummary[]>(key) ?? [];
      throw err;
    }
  }

  async getIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<IssueSummary | undefined> {
    const key = cacheKey(["gh", "issue", owner, repo, number]);
    try {
      const data = await this.getJson<Record<string, unknown>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`,
      );
      const issue = mapGhIssue(data);
      this.cache.set(key, issue);
      return issue;
    } catch (err) {
      if (err instanceof RateLimitError) return this.cache.getStale<IssueSummary>(key);
      return this.cache.getStale<IssueSummary>(key);
    }
  }

  /** Combined check-runs + status for a ref (CI rollup). */
  async getCiStatus(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<CheckConclusion> {
    const key = cacheKey(["gh", "ci", owner, repo, ref]);
    try {
      const data = await this.getJson<{
        state?: string;
        statuses?: Array<{ state?: string }>;
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/status`,
      );
      const state = String(data.state ?? "pending");
      const mapped = mapCombinedStatus(state);
      this.cache.set(key, mapped);
      return mapped;
    } catch (err) {
      if (err instanceof RateLimitError) {
        return this.cache.getStale<CheckConclusion>(key) ?? "unknown";
      }
      return "unknown";
    }
  }

  /** Create a PR via API when a token is present. */
  async createPullRequest(input: CreatePullRequestInput): Promise<PullRequestSummary> {
    if (!this.token) {
      throw new Error("createPullRequest requires an authentication token");
    }
    const data = await this.postJson<Record<string, unknown>>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls`,
      {
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body ?? "",
        draft: input.draft ?? false,
      },
    );
    return mapGhPr(data);
  }

  /** Prefill compare URL for create-PR (always works offline). */
  static createPullRequestUrl(owner: string, repo: string, base: string, head: string): string {
    return `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1`;
  }

  avatarUrl(login: string, size = 64): string {
    return `https://github.com/${encodeURIComponent(login)}.png?size=${size}`;
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    await this.throwIfRateLimited(res);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    await this.throwIfRateLimited(res);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private headers(): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      "User-Agent": "GitSpecs",
    };
  }

  private async throwIfRateLimited(res: Response): Promise<void> {
    if (res.status !== 403 && res.status !== 429) return;
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (remaining === "0" || res.status === 429) {
      const resetAt = reset ? Number(reset) * 1000 : undefined;
      const body = await res.text().catch(() => "");
      throw new RateLimitError(
        `GitHub rate limited${body ? `: ${body.slice(0, 120)}` : ""}`,
        resetAt,
      );
    }
  }
}

function mapCombinedStatus(state: string): CheckConclusion {
  switch (state) {
    case "success":
      return "success";
    case "failure":
    case "error":
      return "failure";
    case "pending":
      return "pending";
    default:
      return "unknown";
  }
}

function mapGhPr(raw: unknown): PullRequestSummary {
  const r = raw as Record<string, unknown>;
  const user = r.user as Record<string, unknown> | undefined;
  const head = r.head as Record<string, unknown> | undefined;
  const base = r.base as Record<string, unknown> | undefined;
  const stateRaw = String(r.state ?? "open");
  const merged = Boolean(r.merged_at);
  return {
    id: String(r.id ?? r.number ?? ""),
    number: Number(r.number) || 0,
    title: String(r.title ?? ""),
    url: String(r.html_url ?? ""),
    state: merged ? "merged" : stateRaw === "closed" ? "closed" : "open",
    authorLogin: user?.login ? String(user.login) : undefined,
    authorAvatarUrl: user?.avatar_url ? String(user.avatar_url) : undefined,
    headRef: head?.ref ? String(head.ref) : undefined,
    baseRef: base?.ref ? String(base.ref) : undefined,
    draft: Boolean(r.draft),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
    mergeable: typeof r.mergeable === "boolean" ? r.mergeable : null,
  };
}

/**
 * Map a GitHub issue-search hit (PR shape) to PullRequestSummary.
 * Search payloads often omit nested `head`/`base`; prefer explicit fields when
 * present, else leave headRef/baseRef for getPullRequest enrichment.
 * Exported for unit tests of the shipped mapper.
 */
export function mapGhSearchIssueToPr(raw: unknown): PullRequestSummary {
  const r = raw as Record<string, unknown>;
  const user = r.user as Record<string, unknown> | undefined;
  // Some search/enterprise payloads may embed head/base like pulls list.
  const head = r.head as Record<string, unknown> | undefined;
  const base = r.base as Record<string, unknown> | undefined;
  // Occasional flat fields from search extensions
  const headRefFlat =
    (typeof r.head_ref === "string" && r.head_ref) ||
    (typeof r.headRef === "string" && r.headRef) ||
    undefined;
  const baseRefFlat =
    (typeof r.base_ref === "string" && r.base_ref) ||
    (typeof r.baseRef === "string" && r.baseRef) ||
    undefined;
  return {
    id: String(r.id ?? r.number ?? ""),
    number: Number(r.number) || 0,
    title: String(r.title ?? ""),
    url: String(r.html_url ?? ""),
    state: String(r.state) === "closed" ? "closed" : "open",
    authorLogin: user?.login ? String(user.login) : undefined,
    authorAvatarUrl: user?.avatar_url ? String(user.avatar_url) : undefined,
    headRef: head?.ref ? String(head.ref) : headRefFlat || undefined,
    baseRef: base?.ref ? String(base.ref) : baseRefFlat || undefined,
    draft: Boolean(r.draft),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  };
}

/** Parse owner/repo from a search issue item (repository_url or html_url). */
export function parseRepoFromSearchItem(
  raw: unknown,
): { owner: string; repo: string } | undefined {
  const r = raw as Record<string, unknown>;
  const repoUrl = typeof r.repository_url === "string" ? r.repository_url : "";
  // https://api.github.com/repos/owner/repo
  const apiMatch = repoUrl.match(/\/repos\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (apiMatch) {
    return { owner: apiMatch[1]!, repo: apiMatch[2]! };
  }
  const html = typeof r.html_url === "string" ? r.html_url : "";
  // https://github.com/owner/repo/pull/7
  const htmlMatch = html.match(
    /github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/\d+/i,
  );
  if (htmlMatch) {
    return { owner: htmlMatch[1]!, repo: htmlMatch[2]! };
  }
  return undefined;
}

function mapGhIssue(raw: Record<string, unknown>): IssueSummary {
  const user = raw.user as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? raw.number ?? ""),
    number: Number(raw.number) || 0,
    title: String(raw.title ?? ""),
    url: String(raw.html_url ?? ""),
    state: String(raw.state) === "closed" ? "closed" : "open",
    authorLogin: user?.login ? String(user.login) : undefined,
    authorAvatarUrl: user?.avatar_url ? String(user.avatar_url) : undefined,
    body: raw.body != null ? String(raw.body) : undefined,
  };
}
