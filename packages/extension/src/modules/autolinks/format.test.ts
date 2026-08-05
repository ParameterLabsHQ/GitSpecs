import { describe, it, expect } from "vitest";
import {
  normalizeAutolinkRules,
  findAutolinks,
  applyAutolinksMarkdown,
  appendAutolinkDetails,
} from "./format.js";

const rules = normalizeAutolinkRules([
  { prefix: "#", url: "https://github.com/org/repo/issues/<num>" },
  { prefix: "JIRA-", url: "https://jira.example.com/browse/JIRA-<num>" },
]);

describe("normalizeAutolinkRules", () => {
  it("drops invalid entries", () => {
    expect(normalizeAutolinkRules(null)).toEqual([]);
    expect(normalizeAutolinkRules([{ prefix: "", url: "x" }])).toEqual([]);
    expect(normalizeAutolinkRules([{ prefix: "#", url: "https://x/<num>" }])).toEqual([
      { prefix: "#", url: "https://x/<num>" },
    ]);
  });
});

describe("findAutolinks", () => {
  it("matches hash and custom prefixes", () => {
    const hits = findAutolinks("Fixes #42 and JIRA-99 done", rules);
    expect(hits.map((h) => h.text)).toEqual(["#42", "JIRA-99"]);
    expect(hits[0]!.url).toBe("https://github.com/org/repo/issues/42");
    expect(hits[1]!.url).toBe("https://jira.example.com/browse/JIRA-99");
  });

  it("does not match bare numbers without prefix", () => {
    expect(findAutolinks("issue 42 only", rules)).toEqual([]);
  });

  it("prefers longer prefix on overlap", () => {
    const r = normalizeAutolinkRules([
      { prefix: "A-", url: "https://a/<num>" },
      { prefix: "AA-", url: "https://aa/<num>" },
    ]);
    const hits = findAutolinks("see AA-7", r);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toBe("AA-7");
    expect(hits[0]!.url).toBe("https://aa/7");
  });
});

describe("applyAutolinksMarkdown / appendAutolinkDetails", () => {
  it("wraps matches as markdown links", () => {
    const md = applyAutolinksMarkdown("see #12 please", rules);
    expect(md).toBe("see [#12](https://github.com/org/repo/issues/12) please");
  });

  it("appends detail footer", () => {
    const t = appendAutolinkDetails("subject #1", rules);
    expect(t).toContain("subject #1");
    expect(t).toContain("Autolinks:");
    expect(t).toContain("https://github.com/org/repo/issues/1");
  });

  it("returns original text when no rules match", () => {
    expect(applyAutolinksMarkdown("hello", rules)).toBe("hello");
    expect(appendAutolinkDetails("hello", rules)).toBe("hello");
  });
});
