import { describe, it, expect } from "vitest";
import { aggregateHub } from "./aggregate.js";
import type { PullRequestSummary } from "@gitspecs/host-api";

function pr(partial: Partial<PullRequestSummary> & { number: number }): PullRequestSummary {
  return {
    id: String(partial.number),
    number: partial.number,
    title: partial.title ?? `PR ${partial.number}`,
    url: partial.url ?? `https://example.com/${partial.number}`,
    state: partial.state ?? "open",
    draft: partial.draft,
    authorLogin: partial.authorLogin,
    headRef: partial.headRef,
  };
}

describe("aggregateHub (P22)", () => {
  it("groups review-requested as needsAction and drafts as blocked", () => {
    const groups = aggregateHub({
      currentLogin: "ada",
      myOpenPrs: [
        { ...pr({ number: 1, draft: true, title: "WIP" }), repoLabel: "app" },
        { ...pr({ number: 2, title: "Ready" }), repoLabel: "app" },
      ],
      reviewRequested: [
        { ...pr({ number: 9, title: "Please review" }), repoLabel: "lib" },
      ],
      wipBranches: [{ name: "feat", ahead: 2, behind: 0, repoLabel: "app" }],
    });
    expect(groups.needsAction.map((i) => i.pr.number)).toEqual([9]);
    expect(groups.blocked.map((i) => i.pr.number)).toEqual([1]);
    expect(groups.waiting.map((i) => i.pr.number)).toEqual([2]);
    expect(groups.wip).toHaveLength(1);
  });
});
