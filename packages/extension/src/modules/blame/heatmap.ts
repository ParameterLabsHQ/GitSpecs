/**
 * Pure age → overview-ruler color helpers for optional blame heatmaps (P14 polish).
 * No vscode imports.
 */

/** Seconds thresholds for heatmap buckets (newer → hotter). */
export const HEATMAP_BUCKETS_SECONDS = [
  7 * 24 * 3600, // week
  30 * 24 * 3600, // month
  90 * 24 * 3600, // quarter
  365 * 24 * 3600, // year
] as const;

/**
 * Map author-time (unix seconds) to a CSS color for overview ruler.
 * Newer commits → warmer; older → cooler. Pure and deterministic.
 */
export function heatmapColorForAuthorTime(
  authorTime: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (!Number.isFinite(authorTime) || authorTime <= 0) {
    return "rgba(128, 128, 128, 0.35)";
  }
  const age = Math.max(0, nowSeconds - authorTime);
  if (age < HEATMAP_BUCKETS_SECONDS[0]) return "rgba(220, 50, 47, 0.55)"; // hot
  if (age < HEATMAP_BUCKETS_SECONDS[1]) return "rgba(255, 140, 0, 0.5)";
  if (age < HEATMAP_BUCKETS_SECONDS[2]) return "rgba(255, 200, 0, 0.45)";
  if (age < HEATMAP_BUCKETS_SECONDS[3]) return "rgba(100, 160, 255, 0.4)";
  return "rgba(80, 80, 160, 0.35)"; // cold
}

export function isHeatmapEnabled(configGet: (key: string, def: boolean) => boolean): boolean {
  return configGet("heatmap", false);
}
