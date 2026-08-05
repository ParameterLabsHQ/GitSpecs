import { describe, it, expect } from "vitest";
import { formatGraphTreeRow, DEFAULT_GRAPH_LIMIT, MAX_GRAPH_LIMIT } from "./format.js";
import type { GraphCommit } from "@gitspecs/git-core";

describe("graph format", () => {
  it("exports performance bounds", () => {
    expect(DEFAULT_GRAPH_LIMIT).toBe(200);
    expect(MAX_GRAPH_LIMIT).toBe(500);
  });

  it("embeds topology prefix and refs in label", () => {
    const node: GraphCommit = {
      sha: "abcdef0123456789abcdef0123456789abcdef01",
      parents: ["b".repeat(40)],
      author: "Dev",
      authorTime: 1_700_000_000,
      subject: "ship graph",
      refs: ["main"],
      lane: 0,
      graph: "* |",
    };
    const row = formatGraphTreeRow(node);
    expect(row.label).toContain("* |");
    expect(row.label).toContain("abcdef0");
    expect(row.label).toContain("ship graph");
    expect(row.label).toContain("main");
    expect(row.tooltip).toContain("parents:");
  });
});
