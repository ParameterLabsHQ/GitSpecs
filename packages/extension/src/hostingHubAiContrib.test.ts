/**
 * Structural checks for P21–P23 gap fixes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("P21 hosting surface completeness", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    contributes?: {
      commands?: { command: string; enablement?: string }[];
      menus?: Record<string, Array<{ command: string; when?: string }>>;
    };
  };
  const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);

  it("declares sign-out and multi-host PAT commands", () => {
    for (const id of [
      "gitspecs.hosting.signOutGitHub",
      "gitspecs.hosting.setBitbucketPat",
      "gitspecs.hosting.setAzurePat",
      "gitspecs.hosting.signOutPats",
      "gitspecs.hosting.createPr",
    ]) {
      expect(cmds).toContain(id);
    }
  });

  it("host-api ships createPullRequest, getIssue, cache, review-requested", () => {
    const gh = readFileSync(
      path.join(repoRoot, "packages/host-api/src/github.ts"),
      "utf8",
    );
    expect(gh).toContain("createPullRequest");
    expect(gh).toContain("getIssue");
    expect(gh).toContain("listReviewRequested");
    expect(gh).toContain("listAssignedIssues");
    expect(gh).toContain("getCiStatus");
    expect(gh).toContain("getDefaultBranch");
    expect(gh).toContain("RateLimitError");
    expect(existsSync(path.join(repoRoot, "packages/host-api/src/cache.ts"))).toBe(true);
  });

  it("branches provider reads PR badge cache", () => {
    const src = readFileSync(path.join(root, "src/modules/branches/provider.ts"), "utf8");
    expect(src).toContain("branchPrBadges");
    expect(src).toContain("prNumber");
  });

  it("create-PR resolves default branch for GitHub and GitLab", () => {
    const src = readFileSync(path.join(root, "src/modules/hosting/commands.ts"), "utf8");
    expect(src).toContain("getDefaultBranch");
    expect(src).toContain("createPullRequest");
    // GitLab path must call getDefaultBranch (not hardcode "main" alone)
    expect(src).toMatch(
      /provider === "gitlab"[\s\S]{0,400}getDefaultBranch/,
    );
    // Badge warm re-fires refresh after cache fill
    expect(src).toContain("warmBranchPrBadges");
    expect(src).toContain("suppressBadgeNetwork");
  });

  it("blame enriches hovers via getIssue path", () => {
    const blame = readFileSync(path.join(root, "src/modules/blame/controller.ts"), "utf8");
    expect(blame).toContain("enrichTextWithIssues");
    const enrich = readFileSync(path.join(root, "src/modules/hosting/enrich.ts"), "utf8");
    expect(enrich).toContain("enrichAutolinkMarkdown");
  });

  it("contributors use provider avatar URLs", () => {
    const src = readFileSync(path.join(root, "src/modules/contributors/provider.ts"), "utf8");
    expect(src).toContain("avatarUrl");
    expect(src).toContain("GitHubClient");
  });
});

describe("P22 hub surface completeness", () => {
  it("loads review-requested, assigned issues, my PRs, CI, and repoRoot", () => {
    const src = readFileSync(path.join(root, "src/modules/hub/provider.ts"), "utf8");
    expect(src).toContain("listReviewRequested");
    expect(src).toContain("listAssignedIssues");
    expect(src).toContain("listMyOpenPullRequests");
    expect(src).toContain("getCiStatus");
    expect(src).toContain("HubIssueTreeItem");
    expect(src).toContain("repoRoot");
    expect(src).toContain("rootByHostRepo");
  });

  it("hub commands resolve repo from item.repoRoot", () => {
    const src = readFileSync(path.join(root, "src/modules/hub/commands.ts"), "utf8");
    expect(src).toContain("resolveHubRepo");
    expect(src).not.toMatch(
      /hub\.checkout[\s\S]{0,200}const repo = repos\.currentRepo/,
    );
    const pure = readFileSync(path.join(root, "src/modules/hub/resolveRepo.ts"), "utf8");
    expect(pure).toContain("repoByRoot");
  });

  it("declares hub open/checkout/worktree commands and menus", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      contributes?: {
        commands?: { command: string }[];
        menus?: { "view/item/context"?: Array<{ command: string; when?: string }> };
      };
    };
    const cmds = (pkg.contributes?.commands ?? []).map((c) => c.command);
    for (const id of [
      "gitspecs.hub.open",
      "gitspecs.hub.checkout",
      "gitspecs.hub.createWorktree",
    ]) {
      expect(cmds).toContain(id);
    }
    const menus = pkg.contributes?.menus?.["view/item/context"] ?? [];
    expect(menus.some((m) => m.command === "gitspecs.hub.open")).toBe(true);
    expect(menus.some((m) => m.command === "gitspecs.hub.checkout")).toBe(true);
    expect(menus.some((m) => m.command === "gitspecs.hub.createWorktree")).toBe(true);
  });
});

describe("P23 AI visibility + Anthropic", () => {
  it("generate/explain use enablement when configured", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      contributes?: { commands?: { command: string; enablement?: string }[] };
    };
    const byId = Object.fromEntries(
      (pkg.contributes?.commands ?? []).map((c) => [c.command, c]),
    );
    expect(byId["gitspecs.ai.generateCommitMessage"]?.enablement).toBe(
      "gitspecs.ai.configured",
    );
    expect(byId["gitspecs.ai.explainCommit"]?.enablement).toBe("gitspecs.ai.configured");
    // configure stays always available (no enablement)
    expect(byId["gitspecs.ai.configure"]?.enablement).toBeUndefined();
  });

  it("ships native Anthropic messages path", () => {
    const src = readFileSync(path.join(root, "src/modules/ai/client.ts"), "utf8");
    expect(src).toContain("anthropicMessages");
    expect(src).toContain("x-api-key");
    expect(src).toContain("anthropic-version");
    expect(src).toContain("detectProvider");
  });
});
