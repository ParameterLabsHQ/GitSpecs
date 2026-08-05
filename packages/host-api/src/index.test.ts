import { describe, it, expect, vi } from "vitest";
import { GitHubClient } from "./github.js";
import { GitLabClient } from "./gitlab.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubClient (stubbed fetch)", () => {
  it("lists PRs for a branch", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(url).toContain("/repos/acme/app/pulls");
      expect(url).toContain("head=acme%3Afeature");
      return jsonResponse([
        {
          id: 1,
          number: 42,
          title: "Add feature",
          html_url: "https://github.com/acme/app/pull/42",
          state: "open",
          user: { login: "ada" },
          head: { ref: "feature" },
          base: { ref: "main" },
          draft: false,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]);
    });
    const client = new GitHubClient({ fetch: fetch as unknown as typeof globalThis.fetch, token: "t" });
    const prs = await client.listPullRequestsForBranch("acme", "app", "feature");
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      number: 42,
      title: "Add feature",
      authorLogin: "ada",
      headRef: "feature",
      state: "open",
    });
    expect(fetch).toHaveBeenCalled();
  });

  it("builds create PR URL without network", () => {
    expect(GitHubClient.createPullRequestUrl("o", "r", "main", "feature")).toContain(
      "github.com/o/r/compare/main...feature",
    );
  });

  it("avatarUrl is provider URL", () => {
    expect(new GitHubClient().avatarUrl("ada")).toContain("github.com/ada.png");
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
    const client = new GitLabClient({ fetch: fetch as unknown as typeof globalThis.fetch, token: "pat" });
    const mrs = await client.listMergeRequests("g/p", { sourceBranch: "feat" });
    expect(mrs[0]).toMatchObject({ number: 7, title: "MR title", authorLogin: "bob" });
  });
});
