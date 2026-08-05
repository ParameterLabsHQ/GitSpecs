import { describe, it, expect, vi } from "vitest";
import { GitHubClient, mapGhSearchIssueToPr, parseRepoFromSearchItem } from "./github.js";
import { GitLabClient } from "./gitlab.js";
import { RateLimitError } from "./types.js";
import { HostApiCache } from "./cache.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("GitHubClient (stubbed fetch)", () => {
  it("lists PRs for a branch", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/repos/acme/app/pulls");
      expect(String(url)).toContain("head=acme%3Afeature");
      return jsonResponse([
        {
          id: 1,
          number: 42,
          title: "Add feature",
          html_url: "https://github.com/acme/app/pull/42",
          state: "open",
          user: { login: "ada", avatar_url: "https://avatars.example/ada" },
          head: { ref: "feature" },
          base: { ref: "main" },
          draft: false,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]);
    });
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    const prs = await client.listPullRequestsForBranch("acme", "app", "feature");
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      number: 42,
      title: "Add feature",
      authorLogin: "ada",
      authorAvatarUrl: "https://avatars.example/ada",
      headRef: "feature",
      state: "open",
    });
  });

  it("getDefaultBranch reads repo.default_branch", async () => {
    const fetch = vi.fn(async () => jsonResponse({ default_branch: "develop" }));
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    expect(await client.getDefaultBranch("o", "r")).toBe("develop");
  });

  it("createPullRequest posts when token present", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.head).toBe("feature");
      expect(body.base).toBe("develop");
      return jsonResponse({
        id: 9,
        number: 3,
        title: body.title,
        html_url: "https://github.com/o/r/pull/3",
        state: "open",
        user: { login: "ada" },
        head: { ref: "feature" },
        base: { ref: "develop" },
      });
    });
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    const pr = await client.createPullRequest({
      owner: "o",
      repo: "r",
      title: "My PR",
      head: "feature",
      base: "develop",
    });
    expect(pr.number).toBe(3);
    expect(pr.url).toContain("/pull/3");
  });

  it("listMyOpenPullRequests filters by login", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([
        {
          number: 1,
          title: "mine",
          html_url: "u1",
          state: "open",
          user: { login: "ada" },
        },
        {
          number: 2,
          title: "theirs",
          html_url: "u2",
          state: "open",
          user: { login: "bob" },
        },
      ]),
    );
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    const mine = await client.listMyOpenPullRequests("o", "r", "ada");
    expect(mine.map((p) => p.number)).toEqual([1]);
  });

  it("listReviewRequested enriches headRef via getPullRequest", async () => {
    const fetch = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/search/issues")) {
        expect(u).toContain("review-requested");
        return jsonResponse({
          items: [
            {
              number: 7,
              title: "Review me",
              html_url: "https://github.com/o/r/pull/7",
              repository_url: "https://api.github.com/repos/o/r",
              state: "open",
              user: { login: "bob" },
            },
          ],
        });
      }
      if (u.includes("/repos/o/r/pulls/7")) {
        return jsonResponse({
          number: 7,
          title: "Review me",
          html_url: "https://github.com/o/r/pull/7",
          state: "open",
          user: { login: "bob" },
          head: { ref: "feature/review-me" },
          base: { ref: "main" },
        });
      }
      return jsonResponse({});
    });
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    const prs = await client.listReviewRequested("ada");
    expect(prs[0]?.number).toBe(7);
    expect(prs[0]?.headRef).toBe("feature/review-me");
  });

  it("listAssignedIssues drops PR payloads", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([
        { number: 1, title: "bug", html_url: "i1", state: "open", user: { login: "x" } },
        {
          number: 2,
          title: "pr",
          html_url: "p1",
          state: "open",
          pull_request: {},
          user: { login: "x" },
        },
      ]),
    );
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    const issues = await client.listAssignedIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(1);
  });

  it("getCiStatus maps combined status", async () => {
    const fetch = vi.fn(async () => jsonResponse({ state: "success" }));
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    expect(await client.getCiStatus("o", "r", "abc")).toBe("success");
  });

  it("returns cached value on rate limit", async () => {
    const cache = new HostApiCache();
    cache.set("gh|prs-open|o|r", [
      {
        id: "1",
        number: 1,
        title: "cached",
        url: "u",
        state: "open" as const,
      },
    ]);
    const fetch = vi.fn(async () =>
      jsonResponse({ message: "rate limit" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "9999999999",
      }),
    );
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
      cache,
    });
    const prs = await client.listOpenPullRequests("o", "r");
    expect(prs[0]?.title).toBe("cached");
  });

  it("returns undefined (not throw) for getAuthenticatedUser when rate-limited with empty cache", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1" }),
    );
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    // Soft fail for user identity — callers treat undefined as signed-out/unavailable.
    await expect(client.getAuthenticatedUser()).resolves.toBeUndefined();
  });

  it("throws RateLimitError from raw list when no stale cache", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1" }),
    );
    // Bypass listOpenPullRequests catch by using getIssue which rethrows? 
    // listOpenPullRequests returns [] on rate limit without cache.
    // createPullRequest should throw RateLimitError with no cache path.
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    await expect(
      client.createPullRequest({
        owner: "o",
        repo: "r",
        title: "t",
        head: "h",
        base: "b",
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("builds create PR URL without network", () => {
    expect(GitHubClient.createPullRequestUrl("o", "r", "main", "feature")).toContain(
      "github.com/o/r/compare/main...feature",
    );
  });

  it("avatarUrl is provider URL", () => {
    expect(new GitHubClient().avatarUrl("ada")).toContain("github.com/ada.png");
  });

  it("getIssue returns title/body for enrichment", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        number: 12,
        title: "Crash on save",
        html_url: "https://github.com/o/r/issues/12",
        state: "open",
        body: "steps…",
        user: { login: "ada", avatar_url: "https://a/ada" },
      }),
    );
    const client = new GitHubClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "t",
    });
    const issue = await client.getIssue("o", "r", 12);
    expect(issue).toMatchObject({ number: 12, title: "Crash on save", body: "steps…" });
  });
});

describe("mapGhSearchIssueToPr / parseRepoFromSearchItem", () => {
  it("reads head_ref when present on search payload", () => {
    const pr = mapGhSearchIssueToPr({
      number: 3,
      title: "t",
      html_url: "https://github.com/a/b/pull/3",
      state: "open",
      head_ref: "feat/x",
      base_ref: "develop",
    });
    expect(pr.headRef).toBe("feat/x");
    expect(pr.baseRef).toBe("develop");
  });

  it("parses owner/repo from repository_url and html_url", () => {
    expect(
      parseRepoFromSearchItem({
        repository_url: "https://api.github.com/repos/Acme/App",
      }),
    ).toEqual({ owner: "Acme", repo: "App" });
    expect(
      parseRepoFromSearchItem({
        html_url: "https://github.com/o/r/pull/9",
      }),
    ).toEqual({ owner: "o", repo: "r" });
  });
});

describe("GitLabClient (stubbed fetch)", () => {
  it("lists merge requests", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([
        {
          id: 9,
          iid: 7,
          title: "MR title",
          web_url: "https://gitlab.com/g/p/-/merge_requests/7",
          state: "opened",
          author: { username: "bob" },
          source_branch: "feat",
          target_branch: "main",
        },
      ]),
    );
    const client = new GitLabClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "pat",
    });
    const mrs = await client.listMergeRequests("g/p", { sourceBranch: "feat" });
    expect(mrs[0]).toMatchObject({ number: 7, title: "MR title", authorLogin: "bob" });
  });

  it("getDefaultBranch reads project.default_branch", async () => {
    const fetch = vi.fn(async () => jsonResponse({ default_branch: "develop" }));
    const client = new GitLabClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      token: "pat",
    });
    expect(await client.getDefaultBranch("g/p")).toBe("develop");
  });
});
