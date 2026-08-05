import { describe, it, expect } from "vitest";
import { parseRemoteUrl, branchUrl, commitUrl, compareUrl } from "./index.js";

describe("parseRemoteUrl", () => {
  const cases: Array<{ url: string; provider: string; owner: string; repo: string }> = [
    {
      url: "https://github.com/acme/widgets.git",
      provider: "github",
      owner: "acme",
      repo: "widgets",
    },
    {
      url: "git@github.com:acme/widgets.git",
      provider: "github",
      owner: "acme",
      repo: "widgets",
    },
    {
      url: "ssh://git@github.com/acme/widgets.git",
      provider: "github",
      owner: "acme",
      repo: "widgets",
    },
    {
      url: "https://gitlab.com/group/sub/project.git",
      provider: "gitlab",
      owner: "group/sub",
      repo: "project",
    },
    {
      url: "git@gitlab.com:group/project.git",
      provider: "gitlab",
      owner: "group",
      repo: "project",
    },
    {
      url: "https://bitbucket.org/team/repo.git",
      provider: "bitbucket",
      owner: "team",
      repo: "repo",
    },
    {
      url: "git@bitbucket.org:team/repo.git",
      provider: "bitbucket",
      owner: "team",
      repo: "repo",
    },
    {
      url: "https://dev.azure.com/myorg/myproject/_git/myrepo",
      provider: "azuredevops",
      owner: "myorg",
      repo: "myrepo",
    },
  ];

  for (const c of cases) {
    it(`parses ${c.url}`, () => {
      const id = parseRemoteUrl(c.url);
      expect(id).toBeDefined();
      expect(id!.provider).toBe(c.provider);
      expect(id!.owner).toBe(c.owner);
      expect(id!.repo).toBe(c.repo);
    });
  }

  it("returns undefined for unparseable remotes without throwing", () => {
    expect(parseRemoteUrl("")).toBeUndefined();
    expect(parseRemoteUrl("not-a-url")).toBeUndefined();
    expect(parseRemoteUrl("https://example.com/onlyone")).toBeUndefined();
  });
});

describe("URL builders", () => {
  it("builds GitHub branch/commit/compare URLs", () => {
    const id = parseRemoteUrl("https://github.com/acme/widgets.git")!;
    expect(branchUrl(id, "main")).toBe("https://github.com/acme/widgets/tree/main");
    expect(commitUrl(id, "abc123")).toBe("https://github.com/acme/widgets/commit/abc123");
    expect(compareUrl(id, "main", "feature")).toContain("/compare/");
  });

  it("builds GitLab URLs", () => {
    const id = parseRemoteUrl("https://gitlab.com/g/p.git")!;
    expect(branchUrl(id, "dev")).toContain("/-/tree/dev");
    expect(commitUrl(id, "deadbeef")).toContain("/-/commit/deadbeef");
  });

  it("builds Bitbucket URLs", () => {
    const id = parseRemoteUrl("https://bitbucket.org/t/r.git")!;
    expect(branchUrl(id, "main")).toContain("/branch/main");
    expect(commitUrl(id, "abc")).toContain("/commits/abc");
  });

  it("builds Azure DevOps URLs", () => {
    const id = parseRemoteUrl("https://dev.azure.com/o/p/_git/r")!;
    expect(branchUrl(id, "main")).toContain("version=GB");
    expect(commitUrl(id, "abc")).toContain("/commit/abc");
  });
});
