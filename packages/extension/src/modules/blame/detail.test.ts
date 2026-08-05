import { describe, it, expect } from "vitest";
import {
  resolveCommitUrl,
  blameDetailActions,
  shouldShowStatusBarBlame,
  toDetailPayload,
} from "./detail.js";
import type { BlameLine } from "@gitspecs/git-core";

const sample: BlameLine = {
  lineNumber: 1,
  sha: "deadbeefcafebabe000000000000000000000001",
  author: "Ada",
  authorMail: "<ada@example.com>",
  authorTime: 1700000000,
  summary: "implement feature",
  content: "x",
};

describe("resolveCommitUrl", () => {
  it("builds github commit URL from parseable remote", () => {
    const url = resolveCommitUrl(
      "https://github.com/ParameterLabsHQ/GitSpecs.git",
      sample.sha,
    );
    expect(url).toBe(
      `https://github.com/ParameterLabsHQ/GitSpecs/commit/${sample.sha}`,
    );
  });

  it("returns undefined for unparseable remote", () => {
    expect(resolveCommitUrl("not-a-url", sample.sha)).toBeUndefined();
    expect(resolveCommitUrl(undefined, sample.sha)).toBeUndefined();
    expect(resolveCommitUrl("https://github.com/acme/widgets.git", "")).toBeUndefined();
  });

  it("handles gitlab remotes via host-urls", () => {
    const url = resolveCommitUrl("https://gitlab.com/g/p.git", "abc123");
    expect(url).toContain("/-/commit/abc123");
  });
});

describe("blameDetailActions", () => {
  it("always includes show message and copy sha", () => {
    const ids = blameDetailActions(false).map((a) => a.id);
    expect(ids).toContain("showMessage");
    expect(ids).toContain("copySha");
    expect(ids).not.toContain("openCommitUrl");
  });

  it("adds open commit URL when available", () => {
    const ids = blameDetailActions(true).map((a) => a.id);
    expect(ids).toContain("openCommitUrl");
  });
});

describe("shouldShowStatusBarBlame", () => {
  it("requires setting, repo, disk file, and blame line", () => {
    expect(shouldShowStatusBarBlame(true, true, true, true)).toBe(true);
    expect(shouldShowStatusBarBlame(false, true, true, true)).toBe(false);
    expect(shouldShowStatusBarBlame(true, false, true, true)).toBe(false);
    expect(shouldShowStatusBarBlame(true, true, false, true)).toBe(false);
    expect(shouldShowStatusBarBlame(true, true, true, false)).toBe(false);
  });
});

describe("toDetailPayload", () => {
  it("maps BlameLine fields for command args", () => {
    const p = toDetailPayload(sample);
    expect(p.sha).toBe(sample.sha);
    expect(p.author).toBe("Ada");
    expect(p.summary).toBe("implement feature");
    expect(p.authorTime).toBe(1700000000);
  });
});
