import { describe, it, expect } from "vitest";
import { enrichAutolinkMarkdown, formatPrBadge } from "./enrich.js";

describe("hosting enrich (P21)", () => {
  it("formatPrBadge", () => {
    expect(formatPrBadge(12)).toBe("PR #12");
    expect(formatPrBadge(undefined)).toBeUndefined();
    expect(formatPrBadge(0)).toBeUndefined();
  });

  it("enrichAutolinkMarkdown injects issue titles", () => {
    const meta = new Map([
      ["42", { number: 42, title: "Crash on save", url: "https://ex/42", state: "open" }],
    ]);
    const out = enrichAutolinkMarkdown(
      "Fixes #42",
      [{ text: "#42", num: "42", url: "https://ex/42" }],
      meta,
    );
    expect(out).toContain("Crash on save");
    expect(out).toContain("Issues:");
    expect(out).toContain("[#42 Crash on save]");
  });
});
