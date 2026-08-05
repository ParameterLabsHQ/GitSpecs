/**
 * Pure multi-repo tree layout helpers (no vscode) — unit-tested without the host.
 */

/**
 * Pure decision: whether tree providers should insert per-repo root groups.
 */
export function shouldGroupByRepo(repoCount: number): boolean {
  return repoCount > 1;
}

/**
 * Pure layout helper for multi-repo tests: when grouping, roots are the top level;
 * when not, leaves are emitted directly.
 */
export function multiRepoTreePlan(
  repoRoots: readonly string[],
): { mode: "flat" } | { mode: "grouped"; roots: readonly string[] } {
  if (repoRoots.length <= 1) return { mode: "flat" };
  return { mode: "grouped", roots: [...repoRoots] };
}
