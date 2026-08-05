import { describe, it, expect } from "vitest";
import { aggregateHub } from "./aggregate.js";
import type { PullRequestSummary, IssueSummary } from "@gitspecs/host-api";

function pr(partial: Partial<PullRequestSummary> & { number: number }): PullRequestSummary {
  return {
    id: String(partial.number),
    number: partial.number,
    title: partial.title ?? `PR ${partial.number}`,
    url: partial.url ?? `https://example.com/${partial.number}`,
    state: partial.state ?? "open",
    draft: partial.draft,
    authorLogin: partial.authorLogin ?? "ada",
    headRef: partial.headRef ?? `branch-${partial.number}`,
    ciStatus: partial.ciStatus,
    mergeable: partial.mergeable,
  };
}

function issue(n: number, title: string): IssueSummary & { repoLabel: string } {
  return {
    id: String(n),
    number: n,
    title,
    url: `https://example.com/issues/${n}`,
    state: "open",
    repoLabel: "app",
  };
}

describe("aggregateHub (P22)", () => {
  it("groups review-requested as needsAction and drafts as blocked", () => {
    const groups = aggregateHub({
      currentLogin: "ada",
      myOpenPrs: [
        { ...pr({ number: 1, draft: true, title: "WIP" }), repoLabel: "app" },
        { ...pr({ number: 2, title: "Ready" }), repoLabel: "app" },
        // Not mine — filtered out when login set
        { ...pr({ number: 3, authorLogin: "bob", title: "Theirs" }), repoLabel: "app" },
      ],
      reviewRequested: [
        { ...pr({ number: 9, title: "Please review", ciStatus: "pending" }), repoLabel: "lib" },
      ],
      assignedIssues: [issue(5, "Fix crash")],
      wipBranches: [{ name: "feat", ahead: 2, behind: 0, repoLabel: "app" }],
    });
    expect(groups.needsAction.map((i) => i.pr.number)).toEqual([9]);
    expect(groups.needsAction[0]?.reason).toContain("CI pending");
    expect(groups.blocked.map((i) => i.pr.number)).toEqual([1]);
    expect(groups.waiting.map((i) => i.pr.number)).toEqual([2]);
    expect(groups.assignedIssues.map((i) => i.issue.number)).toEqual([5]);
    expect(groups.wip).toHaveLength(1);
  });

  it("treats mergeable false as blocked", () => {
    const groups = aggregateHub({
      currentLogin: "ada",
      myOpenPrs: [{ ...pr({ number: 4, mergeable: false }), repoLabel: "app" }],
      reviewRequested: [],
      wipBranches: [],
    });
    expect(groups.blocked).toHaveLength(1);
    expect(groups.blocked[0]?.reason).toMatch(/conflict/i);
  });
});
