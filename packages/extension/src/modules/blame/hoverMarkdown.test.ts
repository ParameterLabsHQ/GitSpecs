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
      actions: defaultBlameHoverActions({
        sha: sample.sha,
        commitUrl: "https://example.com/commit/abcdef0123456789",
      }),
      autolinkRules: [{ prefix: "#", url: "https://example.com/issues/<num>" }],
    });
    expect(md).toContain("**Ada**");
    expect(md).toContain("`abcdef0`");
    expect(md).toContain("Fix");
    expect(md).toContain("command:gitspecs.revision.diffWithPrevious");
    expect(md).toContain("command:gitspecs.history.file");
    expect(md).toContain("command:gitspecs.blame.toggleFile");
    // Copy SHA / Open on Remote use real commands with args, not detail picks
    expect(md).toContain("command:gitspecs.blame.copySha");
    expect(md).toContain("command:gitspecs.blame.openRemote");
    expect(md).toContain(encodeURIComponent(JSON.stringify([sample.sha])));
    expect(md).toContain("Open on Remote");
    expect(md).not.toContain("command:gitspecs.blame.showLine");
    expect(md).not.toContain("command:gitspecs.blame.statusBarDetails");
    // autolink applied inside summary italics
    expect(md).toMatch(/issues\/42|\#42/);
  });

  it("omits copy/remote when sha/url not provided", () => {
    const md = formatDetailsHoverMarkdown(sample, {
      actions: defaultBlameHoverActions({}),
    });
    expect(md).not.toContain("Open on Remote");
    expect(md).not.toContain("Copy SHA");
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
