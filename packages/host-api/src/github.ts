import type {
  HostClientOptions,
  IssueSummary,
  PullRequestSummary,
} from "./types.js";

export class GitHubClient {
  private readonly fetchFn: typeof fetch;
  private readonly token?: string;
  private readonly baseUrl: string;

  constructor(options: HostClientOptions = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  }

  async listPullRequestsForBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<PullRequestSummary[]> {
    const q = new URLSearchParams({
      head: `${owner}:${branch}`,
      state: "open",
      per_page: "10",
    });
    const data = await this.getJson<unknown[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${q}`,
    );
    if (!Array.isArray(data)) return [];
    return data.map(mapGhPr);
  }

  async listOpenPullRequests(owner: string, repo: string): Promise<PullRequestSummary[]> {
    const data = await this.getJson<unknown[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=30`,
    );
    if (!Array.isArray(data)) return [];
    return data.map(mapGhPr);
  }

  async getIssue(
    owner: string,
    repo: string,
    number: number,
  ): Promise<IssueSummary | undefined> {
    try {
      const data = await this.getJson<Record<string, unknown>>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`,
      );
      return mapGhIssue(data);
    } catch {
      return undefined;
    }
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
      headers: {
        Accept: "application/vnd.github+json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        "User-Agent": "GitSpecs",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
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
    headRef: head?.ref ? String(head.ref) : undefined,
    baseRef: base?.ref ? String(base.ref) : undefined,
    draft: Boolean(r.draft),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  };
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
  };
}
