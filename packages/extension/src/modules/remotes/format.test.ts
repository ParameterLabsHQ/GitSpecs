import { describe, it, expect } from "vitest";
import { formatRemoteTreeRow, resolveRemoteWebUrl } from "./format.js";

describe("remotes format", () => {
  it("formats name and urls", () => {
    const row = formatRemoteTreeRow({
      name: "origin",
      fetchUrl: "https://github.com/ParameterLabsHQ/GitSpecs.git",
      pushUrl: "https://github.com/ParameterLabsHQ/GitSpecs.git",
    });
    expect(row.label).toBe("origin");
    expect(row.description).toContain("GitSpecs");
    expect(row.tooltip).toContain("fetch:");
  });

  it("resolves web URL for GitHub remotes", () => {
    expect(
      resolveRemoteWebUrl("https://github.com/ParameterLabsHQ/GitSpecs.git"),
    ).toBe("https://github.com/ParameterLabsHQ/GitSpecs");
    expect(resolveRemoteWebUrl(undefined)).toBeUndefined();
    expect(resolveRemoteWebUrl("not-a-url")).toBeUndefined();
  });
});
