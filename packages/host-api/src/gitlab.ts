import type { HostClientOptions, PullRequestSummary } from "./types.js";

export class GitLabClient {
  private readonly fetchFn: typeof fetch;
  private readonly token?: string;
  private readonly baseUrl: string;

  constructor(options: HostClientOptions = {}) {
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://gitlab.com/api/v4").replace(/\/+$/, "");
  }

  /**
   * List open merge requests for a project path (`group/project`) and optional source branch.
   */
  async listMergeRequests(
    projectPath: string,
    options: { sourceBranch?: string; state?: string } = {},
  ): Promise<PullRequestSummary[]> {
    const id = encodeURIComponent(projectPath);
    const q = new URLSearchParams({
      state: options.state ?? "opened",
      per_page: "30",
    });
    if (options.sourceBranch) q.set("source_branch", options.sourceBranch);
    const data = await this.getJson<unknown[]>(`/projects/${id}/merge_requests?${q}`);
    if (!Array.isArray(data)) return [];
    return data.map(mapGlMr);
  }

  static createMergeRequestUrl(projectPath: string, sourceBranch: string, targetBranch = "main"): string {
    const base = `https://gitlab.com/${projectPath}/-/merge_requests/new`;
    const q = new URLSearchParams({
      "merge_request[source_branch]": sourceBranch,
      "merge_request[target_branch]": targetBranch,
    });
    return `${base}?${q}`;
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: {
        ...(this.token ? { "PRIVATE-TOKEN": this.token } : {}),
        "User-Agent": "GitSpecs",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitLab API ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}

function mapGlMr(raw: unknown): PullRequestSummary {
  const r = raw as Record<string, unknown>;
  const author = r.author as Record<string, unknown> | undefined;
  const state = String(r.state ?? "opened");
  return {
    id: String(r.id ?? r.iid ?? ""),
    number: Number(r.iid) || 0,
    title: String(r.title ?? ""),
    url: String(r.web_url ?? ""),
    state:
      state === "merged"
        ? "merged"
        : state === "closed"
          ? "closed"
          : "open",
    authorLogin: author?.username ? String(author.username) : undefined,
    headRef: r.source_branch ? String(r.source_branch) : undefined,
    baseRef: r.target_branch ? String(r.target_branch) : undefined,
    draft: Boolean(r.draft),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  };
}
