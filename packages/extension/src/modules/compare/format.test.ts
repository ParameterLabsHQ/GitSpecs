import { describe, it, expect } from "vitest";
import {
  formatCompareSummary,
  formatNameStatusLabel,
  resolveCompareUrl,
  stripRemotePrefix,
  buildComparePickItems,
  formatCompareReport,
} from "./format.js";
import type { CompareResult } from "@gitspecs/git-core";

function sampleResult(overrides: Partial<CompareResult> = {}): CompareResult {
  return {
    ahead: 2,
    behind: 1,
    shortstat: "3 files changed, 10 insertions(+), 2 deletions(-)",
    base: "main",
    head: "feature",
    againstWorkingTree: false,
    files: [
      { status: "A", path: "new.txt" },
      { status: "M", path: "edit.ts" },
      { status: "R100", path: "renamed.ts", oldPath: "old.ts" },
    ],
    ...overrides,
  };
}

describe("formatCompareSummary", () => {
  it("includes range, ahead/behind, shortstat, and file count", () => {
    const s = formatCompareSummary(sampleResult());
    expect(s).toContain("main");
    expect(s).toContain("feature");
    expect(s).toContain("ahead 2");
    expect(s).toContain("behind 1");
    expect(s).toContain("3 files changed");
    expect(s).toContain("3 files");
  });

  it("labels working tree head", () => {
    const s = formatCompareSummary(
      sampleResult({ head: "WORKING_TREE", againstWorkingTree: true, files: [] }),
    );
    expect(s).toContain("Working Tree");
    expect(s).toContain("0 files");
  });
});

describe("formatNameStatusLabel", () => {
  it("shows path and status", () => {
    const row = formatNameStatusLabel({ status: "M", path: "src/a.ts" });
    expect(row.label).toContain("src/a.ts");
    expect(row.description).toBe("M");
  });

  it("includes old path detail for renames", () => {
    const row = formatNameStatusLabel({
      status: "R100",
      path: "new.ts",
      oldPath: "old.ts",
    });
    expect(row.detail).toContain("old.ts");
    expect(row.label).toContain("new.ts");
  });
});

describe("resolveCompareUrl", () => {
  it("builds GitHub compare URL from remote", () => {
    const url = resolveCompareUrl(
      "https://github.com/ParameterLabsHQ/GitSpecs.git",
      "main",
      "feature",
      false,
    );
    expect(url).toBe(
      "https://github.com/ParameterLabsHQ/GitSpecs/compare/main...feature",
    );
  });

  it("strips origin/ remote prefixes for host URL", () => {
    const url = resolveCompareUrl(
      "https://github.com/o/r.git",
      "origin/main",
      "origin/feature/x",
      false,
    );
    expect(url).toContain("/compare/main...feature%2Fx");
  });

  it("keeps local slashy branch names", () => {
    const url = resolveCompareUrl(
      "https://github.com/o/r.git",
      "main",
      "feature/x",
      false,
    );
    expect(url).toContain("/compare/main...feature%2Fx");
  });

  it("returns undefined for working tree or bad remote", () => {
    expect(
      resolveCompareUrl(
        "https://github.com/o/r.git",
        "main",
        "WORKING_TREE",
        true,
      ),
    ).toBeUndefined();
    expect(resolveCompareUrl(undefined, "main", "feature", false)).toBeUndefined();
    expect(resolveCompareUrl("not-a-url", "main", "feature", false)).toBeUndefined();
  });
});

describe("stripRemotePrefix", () => {
  it("strips known remote prefixes only", () => {
    expect(stripRemotePrefix("origin/main")).toBe("main");
    expect(stripRemotePrefix("upstream/feature/foo", ["upstream"])).toBe(
      "feature/foo",
    );
    // unknown remote left as-is with default remotes list
    expect(stripRemotePrefix("upstream/feature/foo")).toBe("upstream/feature/foo");
  });

  it("leaves local names and SHAs alone", () => {
    expect(stripRemotePrefix("main")).toBe("main");
    expect(stripRemotePrefix("feature/foo")).toBe("feature/foo");
    expect(stripRemotePrefix("abcdef0")).toBe("abcdef0");
  });
});

describe("buildComparePickItems", () => {
  it("includes host action when URL available, then files", () => {
    const items = buildComparePickItems(sampleResult(), { hasHostUrl: true });
    const actions = items.filter((i) => i.kind === "action");
    const files = items.filter((i) => i.kind === "file");
    expect(actions.map((a) => a.id)).toContain("openHostCompare");
    expect(actions.map((a) => a.id)).toContain("copySummary");
    expect(actions.map((a) => a.id)).toContain("showOutput");
    expect(files).toHaveLength(3);
    expect(files[0]!.path).toBe("new.txt");
  });

  it("omits host action when no URL", () => {
    const items = buildComparePickItems(sampleResult(), { hasHostUrl: false });
    expect(items.filter((i) => i.kind === "action").map((a) => a.id)).not.toContain(
      "openHostCompare",
    );
  });
});

describe("formatCompareReport", () => {
  it("lists files with status", () => {
    const report = formatCompareReport(sampleResult());
    expect(report).toContain("Changed files:");
    expect(report).toContain("new.txt");
    expect(report).toContain("old.ts");
  });
});
