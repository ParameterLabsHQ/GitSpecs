import { describe, it, expect } from "vitest";
import { shouldGroupByRepo, multiRepoTreePlan } from "./repoTreePlan.js";

describe("multi-repo tree plan (P17)", () => {
  it("stays flat for zero or one repo", () => {
    expect(shouldGroupByRepo(0)).toBe(false);
    expect(shouldGroupByRepo(1)).toBe(false);
    expect(multiRepoTreePlan([])).toEqual({ mode: "flat" });
    expect(multiRepoTreePlan(["/a"])).toEqual({ mode: "flat" });
  });

  it("groups when two or more repos", () => {
    expect(shouldGroupByRepo(2)).toBe(true);
    expect(multiRepoTreePlan(["/a", "/b"])).toEqual({
      mode: "grouped",
      roots: ["/a", "/b"],
    });
  });
});
