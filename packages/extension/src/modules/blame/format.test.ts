import { describe, it, expect } from "vitest";
import { formatLineBlame, formatBlameHover } from "./format.js";
import type { BlameLine } from "@gitspecs/git-core";

const sample: BlameLine = {
  lineNumber: 3,
  sha: "deadbeefcafebabe000000000000000000000001",
  author: "Ada",
  authorMail: "<ada@example.com>",
  authorTime: 1700000000,
  summary: "implement feature",
  content: "const x = 1;",
};

describe("formatLineBlame", () => {
  it("uses shipped git-core annotation formatting", () => {
    const text = formatLineBlame(sample);
    expect(text).toContain("Ada");
    expect(text).toContain("deadbee");
    expect(text).toContain("implement feature");
  });
});

describe("formatBlameHover", () => {
  it("includes author and sha", () => {
    const md = formatBlameHover(sample);
    expect(md).toContain("Ada");
    expect(md).toContain("deadbee");
    expect(md).toContain("implement feature");
  });
});
