import { describe, it, expect } from "vitest";
import {
  heatmapColorForAuthorTime,
  isHeatmapEnabled,
  HEATMAP_BUCKETS_SECONDS,
} from "./heatmap.js";

describe("blame heatmap helpers (P14)", () => {
  const now = 1_700_000_000;

  it("returns warmer color for recent commits than old ones", () => {
    const recent = heatmapColorForAuthorTime(now - 60, now);
    const old = heatmapColorForAuthorTime(now - 2 * 365 * 24 * 3600, now);
    expect(recent).not.toBe(old);
    expect(recent).toMatch(/rgba/);
    expect(old).toMatch(/rgba/);
    // Recent uses red-ish hot bucket
    expect(recent).toContain("220");
  });

  it("handles invalid author times", () => {
    expect(heatmapColorForAuthorTime(0, now)).toMatch(/rgba/);
    expect(heatmapColorForAuthorTime(Number.NaN, now)).toMatch(/rgba/);
  });

  it("exports ascending age buckets", () => {
    expect(HEATMAP_BUCKETS_SECONDS[0]).toBeLessThan(HEATMAP_BUCKETS_SECONDS[1]!);
  });

  it("reads heatmap setting via injected getter", () => {
    expect(isHeatmapEnabled((_k, d) => d)).toBe(false);
    expect(isHeatmapEnabled(() => true)).toBe(true);
  });
});
