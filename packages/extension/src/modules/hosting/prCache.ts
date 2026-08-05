import type { PullRequestSummary } from "@gitspecs/host-api";

/**
 * In-memory branch → open PR map for tree badges (P21).
 * Filled by hosting refresh; branches provider reads without network.
 */
export class BranchPrBadgeCache {
  /** key: `${repoRoot}::${branchName}` → PR number or undefined */
  private readonly map = new Map<string, number | undefined>();
  private readonly tooltips = new Map<string, string>();

  static key(repoRoot: string, branch: string): string {
    return `${repoRoot}::${branch}`;
  }

  set(repoRoot: string, branch: string, pr: PullRequestSummary | undefined): void {
    const k = BranchPrBadgeCache.key(repoRoot, branch);
    this.map.set(k, pr?.number);
    if (pr) {
      this.tooltips.set(k, `#${pr.number} ${pr.title}`);
    } else {
      this.tooltips.delete(k);
    }
  }

  getNumber(repoRoot: string, branch: string): number | undefined {
    return this.map.get(BranchPrBadgeCache.key(repoRoot, branch));
  }

  getTooltip(repoRoot: string, branch: string): string | undefined {
    return this.tooltips.get(BranchPrBadgeCache.key(repoRoot, branch));
  }

  clear(): void {
    this.map.clear();
    this.tooltips.clear();
  }
}

/** Process-wide singleton so branches provider and hosting commands share state. */
export const branchPrBadges = new BranchPrBadgeCache();
