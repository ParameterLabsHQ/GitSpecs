import type { PullRequestSummary } from "@gitspecs/host-api";

export type HubUrgency = "blocked" | "needsAction" | "waiting" | "other";

export interface HubPrItem {
  pr: PullRequestSummary;
  urgency: HubUrgency;
  reason: string;
  repoLabel: string;
}

export interface HubAggregationInput {
  /** PRs authored by the current user. */
  myOpenPrs: Array<PullRequestSummary & { repoLabel: string }>;
  /** PRs awaiting review by the current user. */
  reviewRequested: Array<PullRequestSummary & { repoLabel: string }>;
  /** Local WIP branch names that are ahead of upstream. */
  wipBranches: Array<{ name: string; ahead: number; behind: number; repoLabel: string }>;
  /** Current user login (for ownership checks). */
  currentLogin?: string;
}

export interface HubGroups {
  blocked: HubPrItem[];
  needsAction: HubPrItem[];
  waiting: HubPrItem[];
  other: HubPrItem[];
  wip: HubAggregationInput["wipBranches"];
}

/**
 * Pure aggregation / grouping for the work hub (P22).
 * - needsAction: review requested on you, or your draft/open PR needing attention
 * - waiting: your open non-draft PRs (waiting on others)
 * - blocked: your PRs marked draft or conflicted (draft treated as blocked-ish)
 */
export function aggregateHub(input: HubAggregationInput): HubGroups {
  const needsAction: HubPrItem[] = [];
  const waiting: HubPrItem[] = [];
  const blocked: HubPrItem[] = [];
  const other: HubPrItem[] = [];

  for (const pr of input.reviewRequested) {
    needsAction.push({
      pr,
      urgency: "needsAction",
      reason: "Review requested",
      repoLabel: pr.repoLabel,
    });
  }

  for (const pr of input.myOpenPrs) {
    if (pr.draft) {
      blocked.push({
        pr,
        urgency: "blocked",
        reason: "Draft PR",
        repoLabel: pr.repoLabel,
      });
    } else if (pr.state === "open") {
      waiting.push({
        pr,
        urgency: "waiting",
        reason: "Waiting on review",
        repoLabel: pr.repoLabel,
      });
    } else {
      other.push({
        pr,
        urgency: "other",
        reason: pr.state,
        repoLabel: pr.repoLabel,
      });
    }
  }

  return {
    blocked,
    needsAction,
    waiting,
    other,
    wip: input.wipBranches.filter((b) => b.ahead > 0 || b.behind > 0),
  };
}
