import { describe, it, expect } from "vitest";
import {
  formatLineBlame,
  formatBlameHover,
  formatStatusBarBlame,
  formatRelativeTime,
  formatCodeLensAuthors,
  formatCodeLensLastChange,
  formatEnrichedBlameHover,
} from "./format.js";
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

const sampleB: BlameLine = {
  lineNumber: 4,
  sha: "abcdef0123456789000000000000000000000002",
  author: "Bob",
  authorTime: 1700003600,
  summary: "fix bug",
  content: "const y = 2;",
};

const sampleC: BlameLine = {
  lineNumber: 5,
  sha: "deadbeefcafebabe000000000000000000000001",
  author: "Ada",
  authorTime: 1700000000,
  summary: "implement feature",
  content: "const z = 3;",
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

describe("formatRelativeTime", () => {
  it("formats known offsets with fixed now", () => {
    const t = 1_700_000_000;
    const now = t * 1000 + 120_000; // 2 minutes later
    expect(formatRelativeTime(t, now)).toBe("2 minutes ago");
    expect(formatRelativeTime(t, t * 1000 + 10_000)).toBe("just now");
    expect(formatRelativeTime(t, t * 1000 + 3_600_000 * 2)).toBe("2 hours ago");
    expect(formatRelativeTime(t, t * 1000 + 86_400_000 * 3)).toBe("3 days ago");
  });
});

describe("formatStatusBarBlame", () => {
  it("includes author, relative date, and short sha", () => {
    const nowMs = sample.authorTime! * 1000 + 86_400_000 * 2; // 2 days later
    const text = formatStatusBarBlame(sample, { nowMs, relative: true });
    expect(text).toContain("Ada");
    expect(text).toContain("deadbee");
    expect(text).toContain("2 days ago");
    expect(text).not.toContain("implement feature"); // status bar omits summary
  });

  it("supports absolute date style", () => {
    const text = formatStatusBarBlame(sample, { relative: false });
    expect(text).toContain("Ada");
    expect(text).toContain("deadbee");
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("handles missing authorTime", () => {
    const noTime: BlameLine = { ...sample, authorTime: undefined };
    const text = formatStatusBarBlame(noTime);
    expect(text).toContain("Ada");
    expect(text).toContain("deadbee");
  });
});

describe("formatCodeLensAuthors", () => {
  it("counts unique authors", () => {
    expect(formatCodeLensAuthors([sample, sampleB, sampleC])).toBe("2 authors");
    expect(formatCodeLensAuthors([sample, sampleC])).toBe("1 author");
    expect(formatCodeLensAuthors([])).toBeUndefined();
  });
});

describe("formatCodeLensLastChange", () => {
  it("picks the most recent commit summary", () => {
    const nowMs = sampleB.authorTime! * 1000 + 1000;
    const title = formatCodeLensLastChange([sample, sampleB, sampleC], {
      nowMs,
      relative: true,
    });
    expect(title).toBeDefined();
    expect(title).toContain("last change:");
    expect(title).toContain("fix bug");
    expect(title).toContain("Bob");
    expect(title).toMatch(/just now|minute|hour|day/);
  });

  it("returns undefined for empty rows", () => {
    expect(formatCodeLensLastChange([])).toBeUndefined();
  });
});

describe("formatEnrichedBlameHover", () => {
  it("includes relative time and absolute iso", () => {
    const nowMs = sample.authorTime! * 1000 + 3600_000;
    const md = formatEnrichedBlameHover(sample, { nowMs });
    expect(md).toContain("Ada");
    expect(md).toContain("deadbee");
    expect(md).toContain("1 hour ago");
    expect(md).toContain("implement feature");
  });
});
