/**
 * Pure age → overview-ruler heatmap buckets (P14 polish).
 * No vscode imports — decoration types are created in the controller.
 */

/** Fixed bucket count for TextEditorDecorationType instances (hot → cold). */
export const HEATMAP_BUCKET_COUNT = 5;

/**
 * Age thresholds (seconds) separating buckets 0..3; ages ≥ last threshold → bucket 4.
 * Newer commits → lower bucket index (hotter).
 */
export const HEATMAP_BUCKETS_SECONDS = [
  7 * 24 * 3600, // week → bucket 0 if younger
  30 * 24 * 3600, // month
  90 * 24 * 3600, // quarter
  365 * 24 * 3600, // year
] as const;

/** CSS colors aligned with {@link heatmapBucketIndex} (index 0 = newest/hottest). */
export const HEATMAP_BUCKET_COLORS: readonly string[] = [
  "rgba(220, 50, 47, 0.55)", // hot
  "rgba(255, 140, 0, 0.5)",
  "rgba(255, 200, 0, 0.45)",
  "rgba(100, 160, 255, 0.4)",
  "rgba(80, 80, 160, 0.35)", // cold / unknown
];

/**
 * Map author-time (unix seconds) to a heatmap bucket index in `0 .. HEATMAP_BUCKET_COUNT-1`.
 * Newer commits → 0; older → higher. Invalid times → coldest bucket.
 */
export function heatmapBucketIndex(
  authorTime: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): number {
  if (!Number.isFinite(authorTime) || authorTime <= 0) {
    return HEATMAP_BUCKET_COUNT - 1;
  }
  const age = Math.max(0, nowSeconds - authorTime);
  for (let i = 0; i < HEATMAP_BUCKETS_SECONDS.length; i++) {
    if (age < HEATMAP_BUCKETS_SECONDS[i]!) return i;
  }
  return HEATMAP_BUCKET_COUNT - 1;
}

/**
 * Map author-time to the CSS color for that age bucket (same palette as decoration types).
 */
export function heatmapColorForAuthorTime(
  authorTime: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  return HEATMAP_BUCKET_COLORS[heatmapBucketIndex(authorTime, nowSeconds)]!;
}

export function isHeatmapEnabled(configGet: (key: string, def: boolean) => boolean): boolean {
  return configGet("heatmap", false);
}

/**
 * Options passed to `createTextEditorDecorationType` for one heatmap bucket.
 * Pure shape (no vscode enums) so unit tests can assert overview-ruler fields.
 * Controller maps `overviewRulerLane: "full"` → `OverviewRulerLane.Full`.
 */
export function heatmapDecorationTypeOptions(bucketIndex: number): {
  overviewRulerColor: string;
  overviewRulerLane: "full";
  isWholeLine: true;
} {
  const color =
    HEATMAP_BUCKET_COLORS[bucketIndex] ??
    HEATMAP_BUCKET_COLORS[HEATMAP_BUCKET_COUNT - 1]!;
  return {
    overviewRulerColor: color,
    overviewRulerLane: "full",
    isWholeLine: true,
  };
}
