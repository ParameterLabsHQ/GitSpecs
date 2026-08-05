import { describe, it, expect } from "vitest";
import { formatStashTreeRow } from "./format.js";
import type { StashInfo } from "@gitspecs/git-core";

describe("stashes format helpers", () => {
  it("formats ref, message, short sha, and date", () => {
    const stash: StashInfo = {
      index: 0,
      ref: "stash@{0}",
      sha: "abcdef0123456789abcdef0123456789abcdef01",
      message: "WIP on main: p8",
      authorTime: 1_700_000_000,
    };
    const row = formatStashTreeRow(stash);
    expect(row.label).toContain("stash@{0}");
    expect(row.label).toContain("WIP on main: p8");
    expect(row.description).toContain("abcdef0");
    expect(row.description).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(row.tooltip).toContain(stash.sha);
  });

  it("uses placeholder when message empty", () => {
    const row = formatStashTreeRow({
      index: 1,
      ref: "stash@{1}",
      sha: "a".repeat(40),
      message: "",
      authorTime: 0,
    });
    expect(row.label).toContain("(no message)");
  });
});
