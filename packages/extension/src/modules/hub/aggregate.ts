import type { IssueSummary, PullRequestSummary } from "@gitspecs/host-api";

export type HubUrgency = "blocked" | "needsAction" | "waiting" | "other";

export interface HubPrItem {
  pr: PullRequestSummary;
  urgency: HubUrgency;
  reason: string;
  repoLabel: string;
}

export interface HubIssueItem {
  issue: IssueSummary;
  repoLabel: string;
}

export interface HubAggregationInput {
  /** PRs authored by the current user only. */
  myOpenPrs: Array<PullRequestSummary & { repoLabel: string }>;
  /** PRs awaiting review by the current user. */
  reviewRequested: Array<PullRequestSummary & { repoLabel: string }>;
  /** Issues assigned to the current user. */
  assignedIssues?: Array<IssueSummary & { repoLabel: string }>;
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
  assignedIssues: HubIssueItem[];
  wip: HubAggregationInput["wipBranches"];
}

/**
 * Pure aggregation / grouping for the work hub (P22).
 * - needsAction: review requested on you
 * - waiting: your open non-draft PRs (waiting on others)
 * - blocked: your draft PRs or mergeable===false
 * - assignedIssues: issues assigned to you
 */
export function aggregateHub(input: HubAggregationInput): HubGroups {
  const needsAction: HubPrItem[] = [];
  const waiting: HubPrItem[] = [];
  const blocked: HubPrItem[] = [];
  const other: HubPrItem[] = [];
  const login = input.currentLogin?.toLowerCase();

  for (const pr of input.reviewRequested) {
    needsAction.push({
      pr,
      urgency: "needsAction",
      reason: pr.ciStatus ? `Review requested · CI ${pr.ciStatus}` : "Review requested",
      repoLabel: pr.repoLabel,
    });
  }

  for (const pr of input.myOpenPrs) {
    // Defense: only keep authored-by-login when login known
    if (login && pr.authorLogin && pr.authorLogin.toLowerCase() !== login) {
      continue;
    }
    if (pr.draft || pr.mergeable === false) {
      blocked.push({
        pr,
        urgency: "blocked",
        reason: pr.draft
          ? "Draft PR"
          : pr.mergeable === false
            ? "Merge conflicts"
            : "Blocked",
        repoLabel: pr.repoLabel,
      });
    } else if (pr.state === "open") {
      waiting.push({
        pr,
        urgency: "waiting",
        reason: pr.ciStatus ? `Waiting on review · CI ${pr.ciStatus}` : "Waiting on review",
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

  const assignedIssues: HubIssueItem[] = (input.assignedIssues ?? []).map((issue) => ({
    issue,
    repoLabel: issue.repoLabel,
  }));

  return {
    blocked,
    needsAction,
    waiting,
    other,
    assignedIssues,
    wip: input.wipBranches.filter((b) => b.ahead > 0 || b.behind > 0),
  };
}
