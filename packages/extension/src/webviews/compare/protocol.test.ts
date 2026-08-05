import { describe, it, expect } from "vitest";
import { formatCompareHeader, isCompareClientMessage, type CompareDataDto } from "./protocol.js";

describe("compare protocol (P20)", () => {
  it("formats header", () => {
    const d: CompareDataDto = {
      base: "main",
      head: "feature",
      ahead: 2,
      behind: 1,
      shortstat: "3 files changed",
      againstWorkingTree: false,
      files: [],
      repoRoot: "/r",
    };
    expect(formatCompareHeader(d)).toContain("main...feature");
    expect(formatCompareHeader(d)).toContain("↑2");
  });

  it("validates client messages", () => {
    expect(isCompareClientMessage({ type: "cmp:ready" })).toBe(true);
    expect(isCompareClientMessage({ type: "x" })).toBe(false);
  });
});
