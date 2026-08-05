import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  heatmapColorForAuthorTime,
  heatmapBucketIndex,
  heatmapDecorationTypeOptions,
  isHeatmapEnabled,
  HEATMAP_BUCKETS_SECONDS,
  HEATMAP_BUCKET_COUNT,
  HEATMAP_BUCKET_COLORS,
} from "./heatmap.js";

const blameDir = path.dirname(fileURLToPath(import.meta.url));

describe("blame heatmap helpers (P14)", () => {
  const now = 1_700_000_000;

  it("maps recent commits to hotter (lower) buckets than old ones", () => {
    const recent = heatmapBucketIndex(now - 60, now);
    const old = heatmapBucketIndex(now - 2 * 365 * 24 * 3600, now);
    expect(recent).toBe(0);
    expect(old).toBe(HEATMAP_BUCKET_COUNT - 1);
    expect(recent).toBeLessThan(old);
  });

  it("returns warmer color for recent commits than old ones", () => {
    const recent = heatmapColorForAuthorTime(now - 60, now);
    const old = heatmapColorForAuthorTime(now - 2 * 365 * 24 * 3600, now);
    expect(recent).not.toBe(old);
    expect(recent).toBe(HEATMAP_BUCKET_COLORS[0]);
    expect(old).toBe(HEATMAP_BUCKET_COLORS[HEATMAP_BUCKET_COUNT - 1]);
  });

  it("handles invalid author times as coldest bucket", () => {
    expect(heatmapBucketIndex(0, now)).toBe(HEATMAP_BUCKET_COUNT - 1);
    expect(heatmapBucketIndex(Number.NaN, now)).toBe(HEATMAP_BUCKET_COUNT - 1);
    expect(heatmapColorForAuthorTime(0, now)).toMatch(/rgba/);
  });

  it("exports ascending age buckets and matching color list", () => {
    expect(HEATMAP_BUCKETS_SECONDS[0]).toBeLessThan(HEATMAP_BUCKETS_SECONDS[1]!);
    expect(HEATMAP_BUCKET_COLORS).toHaveLength(HEATMAP_BUCKET_COUNT);
  });

  it("reads heatmap setting via injected getter", () => {
    expect(isHeatmapEnabled((_k, d) => d)).toBe(false);
    expect(isHeatmapEnabled(() => true)).toBe(true);
  });

  it("decoration type options declare overviewRulerColor and overviewRulerLane", () => {
    for (let i = 0; i < HEATMAP_BUCKET_COUNT; i++) {
      const opts = heatmapDecorationTypeOptions(i);
      expect(opts.overviewRulerColor).toBe(HEATMAP_BUCKET_COLORS[i]);
      expect(opts.overviewRulerLane).toBe("full");
      expect(opts.isWholeLine).toBe(true);
    }
  });
});

describe("blame heatmap controller wiring (shipped path)", () => {
  const controllerSrc = readFileSync(path.join(blameDir, "controller.ts"), "utf8");

  it("creates heatmap TextEditorDecorationTypes with overviewRulerLane + overviewRulerColor", () => {
    expect(controllerSrc).toContain("createTextEditorDecorationType");
    expect(controllerSrc).toContain("overviewRulerColor");
    expect(controllerSrc).toContain("overviewRulerLane");
    expect(controllerSrc).toContain("OverviewRulerLane.Full");
    expect(controllerSrc).toContain("heatmapDecorationTypeOptions");
    expect(controllerSrc).toContain("heatmapBucketIndex");
    expect(controllerSrc).toContain("heatmapTypes");
  });

  it("does not assign invalid DecorationOptions.overviewRulerColor", () => {
    // Per-range DecorationOptions has no overviewRulerColor — heat must go on decoration types.
    expect(controllerSrc).not.toMatch(/deco\.overviewRulerColor\s*=/);
    expect(controllerSrc).not.toMatch(/DecorationOptions[\s\S]{0,200}overviewRulerColor\s*:/);
  });

  it("applies heatmap via setDecorations on bucket types, not annotation type alone", () => {
    expect(controllerSrc).toMatch(/setDecorations\(\s*this\.heatmapTypes/);
    expect(controllerSrc).toContain("HEATMAP_BUCKET_COUNT");
  });
});
