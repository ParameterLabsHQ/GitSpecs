import { describe, it, expect } from "vitest";
import {
  filterGraphRows,
  isGraphClientMessage,
  toGraphRowDto,
  type GraphRowDto,
} from "./protocol.js";

const sample: GraphRowDto = {
  sha: "abcdef0123456789abcdef0123456789abcdef01",
  shortSha: "abcdef0",
  parents: [],
  author: "Ada",
  authorTime: 1,
  subject: "fix login #12",
  refs: ["main"],
  lane: 0,
  graph: "*",
};

describe("graph protocol (P18)", () => {
  it("toGraphRowDto maps graph nodes", () => {
    const dto = toGraphRowDto({
      sha: sample.sha,
      parents: ["p".repeat(40)],
      author: "Ada",
      authorTime: 2,
      subject: "s",
      refs: ["main"],
      lane: 1,
      graph: "* |",
    });
    expect(dto.shortSha).toBe(sample.sha.slice(0, 7));
    expect(dto.lane).toBe(1);
  });

  it("filterGraphRows matches subject author sha refs", () => {
    const rows = [
      sample,
      { ...sample, sha: "b".repeat(40), shortSha: "bbbbbbb", subject: "other", author: "Bob", refs: [] },
    ];
    expect(filterGraphRows(rows, "login")).toHaveLength(1);
    expect(filterGraphRows(rows, "bob")).toHaveLength(1);
    expect(filterGraphRows(rows, "main")).toHaveLength(1);
    expect(filterGraphRows(rows, "abcdef0")).toHaveLength(1);
    expect(filterGraphRows(rows, "")).toHaveLength(2);
  });

  it("isGraphClientMessage accepts known types", () => {
    expect(isGraphClientMessage({ type: "graph:ready" })).toBe(true);
    expect(isGraphClientMessage({ type: "graph:requestPage", payload: { skip: 0, limit: 50 } })).toBe(
      true,
    );
    expect(isGraphClientMessage({ type: "nope" })).toBe(false);
    expect(isGraphClientMessage(null)).toBe(false);
  });
});
