import { describe, it, expect } from "vitest";
import type { BlameLine } from "@gitspecs/git-core";
import {
  defaultBlameHoverActions,
  formatChangesHoverMarkdown,
  formatCombinedBlameHoverMarkdown,
  formatDetailsHoverMarkdown,
} from "./hoverMarkdown.js";

const sample: BlameLine = {
  lineNumber: 3,
  sha: "abcdef0123456789",
  author: "Ada",
  authorMail: "ada@example.com",
  authorTime: 1_700_000_000,
  summary: "Fix #42 widget",
  content: "const x = 1;",
  previousSha: "1111111222222222",
};

describe("formatDetailsHoverMarkdown", () => {
  it("includes author, short sha, summary, and multi-action command links", () => {
    const md = formatDetailsHoverMarkdown(sample, {
      nowMs: 1_700_000_000 * 1000 + 60_000,
      actions: defaultBlameHoverActions({ hasRemoteUrl: true }),
      autolinkRules: [{ prefix: "#", url: "https://example.com/issues/<num>" }],
    });
    expect(md).toContain("**Ada**");
    expect(md).toContain("`abcdef0`");
    expect(md).toContain("Fix");
    expect(md).toContain("command:gitspecs.revision.diffWithPrevious");
    expect(md).toContain("command:gitspecs.history.file");
    expect(md).toContain("command:gitspecs.blame.toggleFile");
    expect(md).toContain("Open on Remote");
    // autolink applied inside summary italics
    expect(md).toMatch(/issues\/42|\#42/);
  });

  it("omits remote action when hasRemoteUrl is false", () => {
    const md = formatDetailsHoverMarkdown(sample, {
      actions: defaultBlameHoverActions({ hasRemoteUrl: false }),
    });
    expect(md).not.toContain("Open on Remote");
  });
});

describe("formatChangesHoverMarkdown", () => {
  it("shows previous line content and action links", () => {
    const md = formatChangesHoverMarkdown(sample, {
      previousLine: "const x = 0;",
      previousSha: sample.previousSha,
      actions: [
        {
          label: "Open Changes",
          commandUri: "command:gitspecs.revision.diffWithPrevious",
        },
      ],
    });
    expect(md).toContain("**Changes**");
    expect(md).toContain("const x = 0;");
    expect(md).toContain("command:gitspecs.revision.diffWithPrevious");
  });
});

describe("formatCombinedBlameHoverMarkdown", () => {
  it("joins details and changes with a separator when both enabled", () => {
    const md = formatCombinedBlameHoverMarkdown(sample, {
      includeDetails: true,
      includeChanges: true,
      previousLine: "old",
      actions: defaultBlameHoverActions(),
    });
    expect(md).toContain("---");
    expect(md).toContain("**Ada**");
    expect(md).toContain("**Changes**");
  });
});
